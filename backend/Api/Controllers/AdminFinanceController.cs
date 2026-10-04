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
    private readonly IFinanceReportWriter _reportWriter;

    public AdminFinanceController(
        IFinanceService finance,
        IValidator<FinanceSummaryQueryDto> summaryValidator,
        IValidator<FinanceJournalFilterDto> journalValidator,
        IValidator<FinanceRangeDto> rangeValidator,
        IFinanceReportWriter reportWriter)
    {
        _finance = finance;
        _summaryValidator = summaryValidator;
        _journalValidator = journalValidator;
        _rangeValidator = rangeValidator;
        _reportWriter = reportWriter;
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
        [FromQuery] bool includeDeleted = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var filter = new FinanceJournalFilterDto(kind, dateFrom, dateTo, page, pageSize, includeDeleted);
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

    /// <summary>Мягко удаляет расход (запись остаётся, но не входит в итоги). Повтор не ошибка и не меняет, кто и когда удалил.</summary>
    [HttpDelete("expenses/{id:int}")]
    public async Task<ActionResult<ApiResponse<FinanceEntryDto>>> DeleteExpense(int id, CancellationToken cancellationToken)
    {
        var result = await _finance.DeleteExpenseAsync(GetUserId(), id, cancellationToken);
        if (result.IsSuccess)
        {
            return Ok(ApiResponse<FinanceEntryDto>.Ok(result.Value!));
        }

        var failure = ApiResponse<FinanceEntryDto>.Fail(result.Errors, result.ErrorCode, result.ErrorMeta);
        return result.ErrorCode == ResultErrorCodes.NotFound ? NotFound(failure) : BadRequest(failure);
    }

    /// <summary>Excel (.xlsx): журнал и итоги за период (по умолчанию — текущий месяц), не более 20 000 строк.</summary>
    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] DateTime? dateFrom,
        [FromQuery] DateTime? dateTo,
        CancellationToken cancellationToken)
    {
        var range = new FinanceRangeDto(dateFrom, dateTo);
        var errors = await _rangeValidator.ValidateOrNullAsync(range, cancellationToken);
        if (errors is not null)
        {
            return BadRequest(ApiResponse<object>.Fail(errors));
        }

        var result = await _finance.GetExportAsync(range, cancellationToken);
        if (!result.IsSuccess)
        {
            return BadRequest(ApiResponse<object>.Fail(result.Errors, result.ErrorCode, result.ErrorMeta));
        }

        var export = result.Value!;
        Response.Headers.CacheControl = "no-store";
        return File(
            _reportWriter.Write(export),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"finance_{export.Summary.DateFrom}_{export.Summary.DateTo}.xlsx");
    }

    private int GetUserId() => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
