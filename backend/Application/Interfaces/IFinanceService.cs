using Application.Common;
using Application.DTOs;

namespace Application.Interfaces;

public interface IFinanceService
{
    Task<FinanceSummaryDto> GetSummaryAsync(FinanceSummaryQueryDto query, CancellationToken cancellationToken = default);

    /// <summary>Last 12 calendar months of the shop (the current one last), income / reversals / expenses / balance each.</summary>
    Task<FinanceChartDto> GetChartAsync(CancellationToken cancellationToken = default);

    Task<PagedResult<FinanceEntryDto>> GetJournalAsync(FinanceJournalFilterDto filter, CancellationToken cancellationToken = default);

    Task<Result<FinanceEntryDto>> AddExpenseAsync(int adminUserId, CreateExpenseRequestDto request, CancellationToken cancellationToken = default);

    /// <summary>Everything of the period for the Excel export; a failure (code <c>too_many_rows</c>) when it exceeds <see cref="FinanceService.MaxExportRows"/>.</summary>
    Task<Result<FinanceExportDto>> GetExportAsync(FinanceRangeDto range, CancellationToken cancellationToken = default);
}
