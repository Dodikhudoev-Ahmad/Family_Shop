using Xunit;
using Domain.Entities;
using Domain.Interfaces;
using Application.Common;
using Application.DTOs;
using Application.Services;
using Infrastructure.Persistence;

namespace Application.Tests.Integration;

/// <summary>Summary, chart, journal and expenses against a real PostgreSQL, on the shop's calendar (Asia/Almaty, UTC+5).
/// Each test lives in its own year, so the shared database of the class never mixes their figures.</summary>
public class FinanceServiceTests : IClassFixture<PostgresFixture>
{
    private readonly PostgresFixture _db;

    public FinanceServiceTests(PostgresFixture db) => _db = db;

    private static StoreClock ClockAt(DateTime utcNow) => StoreClock.FromId("Asia/Almaty", () => utcNow);

    private static DateTime Utc(int y, int m, int d, int h = 0, int min = 0, int s = 0, int ms = 0) =>
        new(y, m, d, h, min, s, ms, DateTimeKind.Utc);

    private FinanceService ServiceAt(AppDbContext ctx, DateTime utcNow) => new(new UnitOfWork(ctx), ClockAt(utcNow));

    private async Task<FinanceSummaryDto> SummaryAsync(DateTime utcNow, FinancePeriod period, DateTime? from = null, DateTime? to = null)
    {
        await using var ctx = _db.CreateContext();
        return await ServiceAt(ctx, utcNow).GetSummaryAsync(new FinanceSummaryQueryDto(period, from, to));
    }

    private async Task<int> IncomeAtAsync(FinanceTestData data, decimal amount, DateTime at)
    {
        var order = await data.AddOrderAsync(amount, OrderStatus.Delivered, at);
        return await data.AddPaymentAsync(order, PaymentType.Income, amount, at);
    }

    [PostgresFact]
    public async Task Balance_IsIncomeMinusReversalsMinusExpenses()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var at = Utc(2030, 3, 10, 6);
        var first = await data.AddOrderAsync(10_000, OrderStatus.Delivered, at);
        var second = await data.AddOrderAsync(5_000, OrderStatus.Delivered, at);
        await data.AddPaymentAsync(first, PaymentType.Income, 10_000, at);
        await data.AddPaymentAsync(second, PaymentType.Income, 5_000, at);
        await data.AddPaymentAsync(second, PaymentType.Reversal, 5_000, at.AddHours(1));
        await data.AddExpenseAsync(3_000, Utc(2030, 3, 9, 19), ExpenseCategory.Purchase);   // 10 March, 00:00 local
        await data.AddExpenseAsync(1_500, Utc(2030, 3, 10, 19), ExpenseCategory.Delivery);  // 11 March, 00:00 local

        var summary = await SummaryAsync(Utc(2030, 3, 10, 7), FinancePeriod.Custom, new DateTime(2030, 3, 10), new DateTime(2030, 3, 10));

        Assert.Equal(15_000m, summary.Income);
        Assert.Equal(5_000m, summary.Reversals);
        Assert.Equal(3_000m, summary.Expenses); // the 11 March expense is another day
        Assert.Equal(7_000m, summary.Balance);
        Assert.Equal(2, summary.IncomeCount);
        Assert.Equal(1, summary.ExpenseCount);
        Assert.Equal("2030-03-10", summary.DateFrom);
        Assert.Equal("2030-03-10", summary.DateTo);
        Assert.Equal("Asia/Almaty", summary.StoreTimeZone);
    }

    [PostgresFact]
    public async Task Today_StartsAtLocalMidnight_BothEdgesExact()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var now = Utc(2031, 5, 15, 7); // 12:00 on 15 May in Almaty
        await IncomeAtAsync(data, 1, Utc(2031, 5, 14, 18, 59, 59, 999)); // 23:59:59.999 on the 14th local: yesterday
        await IncomeAtAsync(data, 2, Utc(2031, 5, 14, 19));               // 00:00 on the 15th local: today
        await IncomeAtAsync(data, 4, Utc(2031, 5, 15, 18, 59, 59, 999));  // 23:59:59.999 on the 15th local: today
        await IncomeAtAsync(data, 8, Utc(2031, 5, 15, 19));               // 00:00 on the 16th local: tomorrow

        var summary = await SummaryAsync(now, FinancePeriod.Today);

        Assert.Equal(6m, summary.Income);
        Assert.Equal(2, summary.IncomeCount);
        Assert.Equal("2031-05-15", summary.DateFrom);
        Assert.Equal("2031-05-15", summary.DateTo);
    }

    [PostgresFact]
    public async Task Week_StartsOnMondayLocal_ASundayStillBelongsToTheWeekThatEndsWithIt()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var now = Utc(2033, 5, 15, 7); // Sunday 15 May 2033, 12:00 local
        await IncomeAtAsync(data, 1, Utc(2033, 5, 8, 18, 30)); // Sunday 8 May, 23:30 local: the previous week
        await IncomeAtAsync(data, 2, Utc(2033, 5, 8, 19));     // Monday 9 May, 00:00 local: first moment of the week
        await IncomeAtAsync(data, 4, Utc(2033, 5, 15, 5));     // Sunday 15 May, 10:00 local
        await IncomeAtAsync(data, 8, Utc(2033, 5, 15, 19));    // Monday 16 May, 00:00 local: next week

        var summary = await SummaryAsync(now, FinancePeriod.Week);

        Assert.Equal(6m, summary.Income);
        Assert.Equal("2033-05-09", summary.DateFrom);
        Assert.Equal("2033-05-15", summary.DateTo);
    }

    [PostgresFact]
    public async Task Month_StartsOnTheFirstLocal_NotOnUtcsFirst()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var now = Utc(2034, 5, 15, 7);
        await IncomeAtAsync(data, 1, Utc(2034, 4, 30, 18, 59, 59)); // 23:59:59 on 30 April local: April
        await IncomeAtAsync(data, 2, Utc(2034, 4, 30, 19));         // 00:00 on 1 May local, though UTC still says 30 April
        await IncomeAtAsync(data, 4, Utc(2034, 5, 10, 12));

        var summary = await SummaryAsync(now, FinancePeriod.Month);

        Assert.Equal(6m, summary.Income);
        Assert.Equal("2034-05-01", summary.DateFrom);
    }

    [PostgresFact]
    public async Task CustomRange_IncludesBothEndDays_Whole()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        await IncomeAtAsync(data, 1, Utc(2038, 2, 9, 18, 59));   // 9 Feb 23:59 local: before
        await IncomeAtAsync(data, 2, Utc(2038, 2, 9, 19));       // 10 Feb 00:00 local: first day
        await IncomeAtAsync(data, 4, Utc(2038, 2, 11, 18, 59));  // 11 Feb 23:59 local: last day
        await IncomeAtAsync(data, 8, Utc(2038, 2, 11, 19));      // 12 Feb 00:00 local: after

        var summary = await SummaryAsync(Utc(2038, 3, 1), FinancePeriod.Custom, new DateTime(2038, 2, 10), new DateTime(2038, 2, 11));

        Assert.Equal(6m, summary.Income);
    }

    [PostgresFact]
    public async Task AnExpense_BelongsToTheDayItWasEnteredFor_InTheShopsCalendar()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var now = Utc(2035, 5, 15, 7);
        await using (var ctx = _db.CreateContext())
        {
            var service = ServiceAt(ctx, now);
            Assert.True((await service.AddExpenseAsync(data.AdminId, new(ExpenseCategory.Purchase, 2_000, new DateTime(2035, 5, 15)))).IsSuccess);
            Assert.True((await service.AddExpenseAsync(data.AdminId, new(ExpenseCategory.Delivery, 700, new DateTime(2035, 5, 14)))).IsSuccess);
        }

        var today = await SummaryAsync(now, FinancePeriod.Today);
        var month = await SummaryAsync(now, FinancePeriod.Month);

        Assert.Equal(2_000m, today.Expenses);
        Assert.Equal(1, today.ExpenseCount);
        Assert.Equal(2_700m, month.Expenses);
        Assert.Equal(-2_700m, month.Balance);
    }

    [PostgresFact]
    public async Task AddingAnExpense_StoresTheShopDayAsUtc_RecordsTheAuthor_AndReturnsTheEntry()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var now = Utc(2039, 5, 15, 7);
        FinanceEntryDto entry;
        await using (var ctx = _db.CreateContext())
        {
            var result = await ServiceAt(ctx, now).AddExpenseAsync(data.AdminId, new(ExpenseCategory.Other, 2_500, new DateTime(2039, 5, 15), "  Упаковка  "));
            Assert.True(result.IsSuccess);
            entry = result.Value!;
        }

        Assert.Equal(FinanceEntryKind.Expense, entry.Kind);
        Assert.Equal(2_500m, entry.Amount);
        Assert.Equal(ExpenseCategory.Other, entry.Category);
        Assert.Equal("Упаковка", entry.Comment);
        Assert.Equal("Админ", entry.Author);
        Assert.Null(entry.OrderId);
        Assert.Equal(Utc(2039, 5, 14, 19), entry.Date); // 00:00 on the 15th in Almaty
    }

    [PostgresFact]
    public async Task AnExpenseForTomorrow_IsRefused_AndNothingIsStored()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var now = Utc(2040, 5, 15, 7);
        await using (var ctx = _db.CreateContext())
        {
            var result = await ServiceAt(ctx, now).AddExpenseAsync(data.AdminId, new(ExpenseCategory.Other, 100, new DateTime(2040, 5, 16)));
            Assert.False(result.IsSuccess);
        }

        Assert.Equal(0, (await SummaryAsync(now, FinancePeriod.Custom, new DateTime(2040, 1, 1), new DateTime(2040, 12, 31))).ExpenseCount);
    }

    [PostgresFact]
    public async Task Chart_HasTwelveLocalMonths_CurrentLast_GroupedByTheShopsCalendar()
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var now = Utc(2036, 5, 15, 7);
        await IncomeAtAsync(data, 1, Utc(2036, 5, 31, 18, 59, 59)); // 23:59:59 on 31 May local: May
        await IncomeAtAsync(data, 2, Utc(2035, 6, 30, 18, 59));     // 30 June 23:59 local: June 2035
        await IncomeAtAsync(data, 4, Utc(2035, 6, 30, 19, 30));     // 00:30 on 1 July local, 19:30 UTC on 30 June: July 2035
        await IncomeAtAsync(data, 8, Utc(2035, 5, 31, 18, 59));     // 31 May 2035 23:59 local: 13 months back, outside
        var reversed = await data.AddOrderAsync(16, OrderStatus.Delivered, Utc(2036, 3, 2));
        await data.AddPaymentAsync(reversed, PaymentType.Income, 16, Utc(2036, 3, 2));
        await data.AddPaymentAsync(reversed, PaymentType.Reversal, 16, Utc(2036, 3, 3));
        await data.AddExpenseAsync(32, Utc(2036, 2, 29, 19));       // 1 March local

        FinanceChartDto chart;
        await using (var ctx = _db.CreateContext())
        {
            chart = await ServiceAt(ctx, now).GetChartAsync();
        }

        Assert.Equal(12, chart.Months.Count);
        Assert.Equal("2035-06", chart.Months[0].Month);
        Assert.Equal("2036-05", chart.Months[11].Month);
        Assert.Equal(12, chart.Months.Select(m => m.Month).Distinct().Count());
        Assert.Equal(2m, chart.Months[0].Income);
        Assert.Equal(4m, chart.Months[1].Income);   // July 2035
        Assert.Equal(1m, chart.Months[11].Income);
        var march = chart.Months.Single(m => m.Month == "2036-03");
        Assert.Equal((16m, 16m, 32m, -32m), (march.Income, march.Reversals, march.Expenses, march.Balance));
        Assert.Equal(7m + 16m, chart.Months.Sum(m => m.Income)); // the 8 of 13 months back is not counted
    }

    private async Task SeedJournalAsync(int year)
    {
        var data = await new FinanceTestData(_db).SeedAsync();
        var order = await data.AddOrderAsync(1_000, OrderStatus.Delivered, Utc(year, 6, 1));
        await data.AddPaymentAsync(order, PaymentType.Income, 1_000, Utc(year, 6, 1, 10));
        await data.AddPaymentAsync(order, PaymentType.Reversal, 1_000, Utc(year, 6, 3, 10));
        await IncomeAtAsync(data, 2_000, Utc(year, 6, 2, 10));
        await data.AddExpenseAsync(300, Utc(year, 6, 1, 19), ExpenseCategory.Purchase, "Закупка");   // 2 June local
        await data.AddExpenseAsync(400, Utc(year, 6, 4, 19), ExpenseCategory.Delivery);             // 5 June local
    }

    private async Task<PagedResult<FinanceEntryDto>> JournalAsync(int year, FinanceEntryKind? kind = null, int fromDay = 1, int toDay = 30, int page = 1, int pageSize = 20)
    {
        await using var ctx = _db.CreateContext();
        return await ServiceAt(ctx, Utc(year, 7, 1)).GetJournalAsync(
            new FinanceJournalFilterDto(kind, new DateTime(year, 6, fromDay), new DateTime(year, 6, toDay), page, pageSize));
    }

    [PostgresFact]
    public async Task Journal_ListsPaymentsAndExpensesTogether_NewestFirst_WithDetails()
    {
        await SeedJournalAsync(2037);

        var all = await JournalAsync(2037);

        Assert.Equal(5, all.TotalCount);
        Assert.Equal(all.Items.OrderByDescending(e => e.Date).Select(e => e.Id + ":" + e.Kind), all.Items.Select(e => e.Id + ":" + e.Kind));
        Assert.Equal(FinanceEntryKind.Expense, all.Items[0].Kind);        // 5 June local
        Assert.Equal(400m, all.Items[0].Amount);
        Assert.Equal(FinanceEntryKind.Reversal, all.Items[1].Kind);       // 3 June
        Assert.NotNull(all.Items[1].OrderId);
        var purchase = all.Items.Single(e => e.Category == ExpenseCategory.Purchase);
        Assert.Equal("Закупка", purchase.Comment);
        Assert.Equal("Админ", purchase.Author);
        Assert.All(all.Items, e => Assert.True(e.Amount > 0));
    }

    [PostgresTheory]
    [InlineData(FinanceEntryKind.Income, 2)]
    [InlineData(FinanceEntryKind.Reversal, 1)]
    [InlineData(FinanceEntryKind.Expense, 2)]
    public async Task Journal_FiltersByKind(FinanceEntryKind kind, int expected)
    {
        var year = 2050 + (int)kind; // a year of its own: the cases of a theory share the database
        await SeedJournalAsync(year);

        var page = await JournalAsync(year, kind);

        Assert.Equal(expected, page.TotalCount);
        Assert.All(page.Items, e => Assert.Equal(kind, e.Kind));
    }

    [PostgresFact]
    public async Task Journal_DateFilterIsTheShopsDay_AndPagingNeitherSkipsNorRepeatsRows()
    {
        await SeedJournalAsync(2045);

        // 2 June local only: the 2000 income (10:00 UTC = 15:00 local) and the 300 expense (00:00 local).
        var oneDay = await JournalAsync(2045, fromDay: 2, toDay: 2);
        Assert.Equal(new[] { 2_000m, 300m }, oneDay.Items.Select(e => e.Amount).OrderByDescending(a => a).ToArray());

        var seen = new List<string>();
        for (var page = 1; page <= 3; page++)
        {
            var result = await JournalAsync(2045, page: page, pageSize: 2);
            Assert.Equal(5, result.TotalCount);
            Assert.Equal(page < 3, result.HasMore);
            seen.AddRange(result.Items.Select(e => e.Kind + ":" + e.Id));
        }

        Assert.Equal(5, seen.Count);
        Assert.Equal(5, seen.Distinct().Count());
    }
}
