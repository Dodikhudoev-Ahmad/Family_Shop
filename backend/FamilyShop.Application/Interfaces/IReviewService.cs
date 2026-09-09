using FamilyShop.Application.Common;
using FamilyShop.Application.DTOs;

namespace FamilyShop.Application.Interfaces;

public interface IReviewService
{
    Task<PagedResult<ReviewDto>> GetReviewsAsync(int productId, ReviewFilterDto filter, CancellationToken cancellationToken = default);
    Task<Result<ReviewSummaryDto>> GetSummaryAsync(int productId, CancellationToken cancellationToken = default);
    Task<ReviewDto?> GetMyReviewAsync(int productId, int userId, CancellationToken cancellationToken = default);
    Task<Result<ReviewDto>> CreateReviewAsync(int productId, int userId, CreateReviewRequestDto request, CancellationToken cancellationToken = default);
    Task<Result<bool>> DeleteMyReviewAsync(int productId, int userId, CancellationToken cancellationToken = default);
}
