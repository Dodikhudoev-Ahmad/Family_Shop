using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Entities;
using Domain.Interfaces;

namespace Application.Services;

/// <summary>
/// Reading the money ledger and entering expenses. Every period boundary comes from <see cref="StoreClock"/> (the shop's
/// calendar, Asia/Almaty by default), never from UTC's midnight; dates are stored in UTC and only compared with the UTC
/// instants of those local boundaries.
/// </summary>
public class FinanceService : IFinanceService
{
    public const int MaxExportRows = 20_000;
    public const int ChartMonths = 12;
    public const decimal MaxExpense = 1_000_000_000m;

    private readonly IUnitOfWork _unitOfWork;
    private readonly StoreClock _clock;

    public FinanceService(IUnitOfWork unitOfWork, StoreClock? clock = null)
    {
        _unitOfWork = unitOfWork;
        _clock = clock ?? StoreClock.Default;
    }

    private DateTime Today => _clock.ToLocal(_clock.UtcNow).Date;

    /// <summary>The first and last shop calendar day of a preset or custom period.</summary>
    private (DateTime From, DateTime To) Days(FinancePeriod period, DateTime? dateFrom, DateTime? dateTo)
    {
        var today = Today;
        return period switch
        {
            FinancePeriod.Today => (today, today),
            FinancePeriod.Week => (today.AddDays(-(((int)today.DayOfWeek + 6) % 7)), today),
            FinancePeriod.Month => (new DateTime(today.Year, today.Month, 1), today),
            _ => (dateFrom!.Value.Date, dateTo!.Value.Date)
        };
    }

    private (DateTime FromUtc, DateTime ToUtc) Bounds(DateTime fromDay, DateTime toDay) =>
        (_clock.StartOfLocalDayUtc(fromDay), _clock.EndOfLocalDayUtc(toDay));

    private static string Day(DateTime date) => date.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);

    public async Task<FinanceSummaryDto> GetSummaryAsync(FinanceSummaryQueryDto query, CancellationToken cancellationToken = default)
    {
        var (from, to) = Days(query.Period, query.DateFrom, query.DateTo);
        return await SummaryAsync(query.Period, from, to, cancellationToken);
    }

    private async Task<FinanceSummaryDto> SummaryAsync(FinancePeriod period, DateTime from, DateTime to, CancellationToken cancellationToken)
    {
        var (fromUtc, toUtc) = Bounds(from, to);
        var totals = await _unitOfWork.Finance.GetTotalsAsync(fromUtc, toUtc, cancellationToken);
        return new FinanceSummaryDto(
            period, Day(from), Day(to),
            totals.Income, totals.Reversals, totals.Expenses, totals.Income - totals.Reversals - totals.Expenses,
            totals.IncomeCount, totals.ExpenseCount, _clock.ZoneId);
    }

    public async Task<FinanceChartDto> GetChartAsync(CancellationToken cancellationToken = default)
    {
        var today = Today;
        var firstMonth = new DateTime(today.Year, today.Month, 1).AddMonths(-(ChartMonths - 1));
        var (fromUtc, toUtc) = Bounds(firstMonth, new DateTime(today.Year, today.Month, 1).AddMonths(1).AddDays(-1));

        var movements = await _unitOfWork.Finance.GetMovementsAsync(fromUtc, toUtc, cancellationToken);
        var income = new decimal[ChartMonths];
        var reversals = new decimal[ChartMonths];
        var expenses = new decimal[ChartMonths];
        foreach (var m in movements)
        {
            var local = _clock.ToLocal(m.At);
            var index = (local.Year - firstMonth.Year) * 12 + local.Month - firstMonth.Month;
            if (index is < 0 or >= ChartMonths) continue;
            switch (m.Type)
            {
                case PaymentType.Income: income[index] += m.Amount; break;
                case PaymentType.Reversal: reversals[index] += m.Amount; break;
                default: expenses[index] += m.Amount; break;
            }
        }

        var months = Enumerable.Range(0, ChartMonths)
            .Select(i => new FinanceMonthDto(
                firstMonth.AddMonths(i).ToString("yyyy-MM", System.Globalization.CultureInfo.InvariantCulture),
                income[i], reversals[i], expenses[i], income[i] - reversals[i] - expenses[i]))
            .ToList();
        return new FinanceChartDto(_clock.ZoneId, months);
    }

    private static FinanceEntryDto ToDto(FinanceEntry e) =>
        new(e.Kind, e.Id, e.Date, e.Amount, e.OrderId, e.Category, e.Comment, e.Author, e.IsDeleted, e.DeletedAt);

    public async Task<PagedResult<FinanceEntryDto>> GetJournalAsync(FinanceJournalFilterDto filter, CancellationToken cancellationToken = default)
    {
        var (items, total) = await _unitOfWork.Finance.GetJournalAsync(
            filter.Kind,
            filter.DateFrom is { } from ? _clock.StartOfLocalDayUtc(from) : null,
            filter.DateTo is { } to ? _clock.EndOfLocalDayUtc(to) : null,
            filter.IncludeDeleted,
            filter.Page, filter.PageSize, cancellationToken);
        return new PagedResult<FinanceEntryDto>(items.Select(ToDto).ToList(), total, filter.Page, filter.PageSize);
    }

    public async Task<Result<FinanceEntryDto>> AddExpenseAsync(int adminUserId, CreateExpenseRequestDto request, CancellationToken cancellationToken = default)
    {
        // Structure (positive whole amount, enum, comment length) is checked by the validator; the clock is needed for this one.
        if (request.Date.Date > Today)
        {
            return Result<FinanceEntryDto>.Failure("Дата расхода не может быть в будущем.");
        }

        var expense = await _unitOfWork.Finance.AddExpenseAsync(new Expense
        {
            Category = request.Category,
            Amount = request.Amount,
            ExpenseDate = _clock.StartOfLocalDayUtc(request.Date),
            Comment = string.IsNullOrWhiteSpace(request.Comment) ? null : request.Comment.Trim(),
            CreatedByUserId = adminUserId,
            CreatedAt = DateTime.UtcNow
        }, cancellationToken);

        var entry = await _unitOfWork.Finance.GetExpenseEntryAsync(expense.Id, cancellationToken);
        return Result<FinanceEntryDto>.Success(ToDto(entry!));
    }

    public async Task<Result<FinanceEntryDto>> DeleteExpenseAsync(int adminUserId, int expenseId, CancellationToken cancellationToken = default)
    {
        // Whether this call deleted it or an earlier one did is deliberately not told apart: the answer is the same expense, deleted.
        await _unitOfWork.Finance.TryDeleteExpenseAsync(expenseId, adminUserId, _clock.UtcNow, cancellationToken);
        var entry = await _unitOfWork.Finance.GetExpenseEntryAsync(expenseId, cancellationToken);
        return entry is null
            ? Result<FinanceEntryDto>.Failure("Расход не найден.", ResultErrorCodes.NotFound)
            : Result<FinanceEntryDto>.Success(ToDto(entry));
    }

    public async Task<Result<FinanceExportDto>> GetExportAsync(FinanceRangeDto range, CancellationToken cancellationToken = default)
    {
        var today = Today;
        var from = range.DateFrom?.Date ?? new DateTime(today.Year, today.Month, 1);
        var to = range.DateTo?.Date ?? today;
        var (fromUtc, toUtc) = Bounds(from, to);

        // The count tells whether the period is over the cap; at most MaxExportRows rows are read either way.
        var (items, total) = await _unitOfWork.Finance.GetJournalAsync(null, fromUtc, toUtc, false, 1, MaxExportRows, cancellationToken);
        if (total > MaxExportRows)
        {
            return Result<FinanceExportDto>.Failure(
                $"За выбранный период больше {MaxExportRows} записей. Сократите период.", ResultErrorCodes.TooManyRows);
        }

        var summary = await SummaryAsync(FinancePeriod.Custom, from, to, cancellationToken);
        return Result<FinanceExportDto>.Success(new FinanceExportDto(_clock.ZoneId, summary, items.Select(ToDto).ToList()));
    }
}
