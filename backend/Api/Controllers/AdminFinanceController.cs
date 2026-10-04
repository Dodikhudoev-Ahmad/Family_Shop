using System.Security.Claims;
using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Api.Common;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Interfaces;

namespace Api.Controllers;

/// <summary>Финансы магазина (платежи, расходы, баланс) — только для администратора.</summary>
[ApiController]
[Route("api/v1/admin/finance")]
[Authorize(Roles = "Admin")]
public class AdminFinanceController : ControllerBase
{
    private readonly IFinanceService _finance;
    private readonly IValidator<FinanceSummaryQueryDto> _summaryValidator;
    private readonly IValidator<FinanceJournalFilterDto> _journalValidator;
    private readonly IValidator<FinanceRangeDto> _rangeValidator;

    public AdminFinanceController(
        IFinanceService finance,
        IValidator<FinanceSummaryQueryDto> summaryValidator,
        IValidator<FinanceJournalFilterDto> journalValidator,
        IValidator<FinanceRangeDto> rangeValidator)
    {
        _finance = finance;
        _summaryValidator = summaryValidator;
        _journalValidator = journalValidator;
        _rangeValidator = rangeValidator;
    }

    /// <summary>Приход, сторно, расходы и баланс за сегодня / неделю / месяц / произвольный период (календарь магазина).</summary>
    [HttpGet("summary")]
    public async Task<ActionResult<ApiResponse<FinanceSummaryDto>>> GetSummary(
        [FromQuery] FinancePeriod period = FinancePeriod.Month,
        [FromQuery] DateTime? dateFrom = null,
        [FromQuery] DateTime? dateTo = null,
        CancellationToken cancellationToken = default)
    {
        var query = new FinanceSummaryQueryDto(period, dateFrom, dateTo);
        var errors = await _summaryValidator.ValidateOrNullAsync(query, cancellationToken);
        if (errors is not null)
        {
            return BadRequest(ApiResponse<FinanceSummaryDto>.Fail(errors));
        }

        return Ok(ApiResponse<FinanceSummaryDto>.Ok(await _finance.GetSummaryAsync(query, cancellationToken)));
    }

    /// <summary>График: последние 12 календарных месяцев магазина.</summary>
    [HttpGet("chart")]
    public async Task<ActionResult<ApiResponse<FinanceChartDto>>> GetChart(CancellationToken cancellationToken)
    {
        return Ok(ApiResponse<FinanceChartDto>.Ok(await _finance.GetChartAsync(cancellationToken)));
    }

    /// <summary>Журнал платежей и расходов: фильтр по виду и датам, пагинация, новые сверху.</summary>
    [HttpGet("journal")]
    public async Task<ActionResult<ApiResponse<PagedResult<FinanceEntryDto>>>> GetJournal(
        [FromQuery] FinanceEntryKind? kind,
        [FromQuery] DateTime? dateFrom,
        [FromQuery] DateTime? dateTo,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var filter = new FinanceJournalFilterDto(kind, dateFrom, dateTo, page, pageSize);
        var errors = await _journalValidator.ValidateOrNullAsync(filter, cancellationToken);
        if (errors is not null)
        {
            return BadRequest(ApiResponse<PagedResult<FinanceEntryDto>>.Fail(errors));
        }

        return Ok(ApiResponse<PagedResult<FinanceEntryDto>>.Ok(await _finance.GetJournalAsync(filter, cancellationToken)));
    }

    /// <summary>Вносит расход. Автор — администратор из токена. Расход не редактируется и не удаляется.</summary>
    [HttpPost("expenses")]
    public async Task<ActionResult<ApiResponse<FinanceEntryDto>>> AddExpense(CreateExpenseRequestDto request, CancellationToken cancellationToken)
    {
        var result = await _finance.AddExpenseAsync(GetUserId(), request, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<FinanceEntryDto>.Ok(result.Value!))
            : BadRequest(ApiResponse<FinanceEntryDto>.Fail(result.Errors));
    }

    private int GetUserId() => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
