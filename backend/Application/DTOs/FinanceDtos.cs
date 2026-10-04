using System.Text.Json.Serialization;
using Domain.Entities;
using Domain.Interfaces;

namespace Application.DTOs;

public enum FinancePeriod
{
    Today,
    Week,
    Month,
    Custom
}

/// <summary>Query of the summary: a preset period or, for <see cref="FinancePeriod.Custom"/>, both dates (shop calendar days).</summary>
public record FinanceSummaryQueryDto(FinancePeriod Period = FinancePeriod.Month, DateTime? DateFrom = null, DateTime? DateTo = null);

/// <summary>A date range in shop calendar days, both ends included (export; defaults to the current month).</summary>
public record FinanceRangeDto(DateTime? DateFrom = null, DateTime? DateTo = null);

public record FinanceJournalFilterDto(
    FinanceEntryKind? Kind = null,
    DateTime? DateFrom = null,
    DateTime? DateTo = null,
    int Page = 1,
    int PageSize = 20);

/// <summary>Income - reversals - expenses of a period. Dates are the shop's calendar days (yyyy-MM-dd); money is whole tenge.</summary>
public record FinanceSummaryDto(
    [property: JsonConverter(typeof(JsonStringEnumConverter))] FinancePeriod Period,
    string DateFrom,
    string DateTo,
    decimal Income,
    decimal Reversals,
    decimal Expenses,
    decimal Balance,
    int IncomeCount,
    int ExpenseCount,
    string StoreTimeZone);

public record FinanceMonthDto(string Month, decimal Income, decimal Reversals, decimal Expenses, decimal Balance);

public record FinanceChartDto(string StoreTimeZone, IReadOnlyList<FinanceMonthDto> Months);

/// <summary>One journal line. <c>Amount</c> is always positive; <c>Kind</c> gives the sign (an income adds, a reversal and an expense subtract).</summary>
public record FinanceEntryDto(
    [property: JsonConverter(typeof(JsonStringEnumConverter))] FinanceEntryKind Kind,
    int Id,
    DateTime Date,
    decimal Amount,
    int? OrderId,
    [property: JsonConverter(typeof(JsonStringEnumConverter))] ExpenseCategory? Category,
    string? Comment,
    string? Author);

public record CreateExpenseRequestDto(
    [property: JsonConverter(typeof(JsonStringEnumConverter))] ExpenseCategory Category,
    decimal Amount,
    DateTime Date,
    string? Comment = null);

/// <summary>The journal of a period for the Excel export, with the totals shown on its second sheet.</summary>
public record FinanceExportDto(string StoreTimeZone, FinanceSummaryDto Summary, IReadOnlyList<FinanceEntryDto> Entries);
