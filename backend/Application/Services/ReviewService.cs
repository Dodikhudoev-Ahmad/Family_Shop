using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Entities;
using Domain.Interfaces;

namespace Application.Services;

public class ReviewService : IReviewService
{
    private readonly IUnitOfWork _unitOfWork;

    public ReviewService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<PagedResult<ReviewDto>> GetReviewsAsync(int productId, ReviewFilterDto filter, CancellationToken cancellationToken = default)
    {
        var sortOrder = filter.SortBy switch
        {
            ReviewSortBy.HighestRating => ReviewSortOrder.HighestRating,
            ReviewSortBy.LowestRating => ReviewSortOrder.LowestRating,
            _ => ReviewSortOrder.Newest
        };

        var (items, totalCount) = await _unitOfWork.Reviews.GetByProductIdAsync(productId, sortOrder, filter.Page, filter.PageSize, cancellationToken);
        return new PagedResult<ReviewDto>(items.Select(ToDto).ToList(), totalCount, filter.Page, filter.PageSize);
    }

    public async Task<Result<ReviewSummaryDto>> GetSummaryAsync(int productId, CancellationToken cancellationToken = default)
    {
        var product = await _unitOfWork.Products.GetByIdAsync(productId, cancellationToken);
        if (product is null)
        {
            return Result<ReviewSummaryDto>.Failure("Product not found.");
        }

        var distribution = await _unitOfWork.Reviews.GetRatingDistributionAsync(productId, cancellationToken);
        return Result<ReviewSummaryDto>.Success(new ReviewSummaryDto(product.AverageRating, product.ReviewCount, distribution));
    }

    public async Task<ReviewDto?> GetMyReviewAsync(int productId, int userId, CancellationToken cancellationToken = default)
    {
        var review = await _unitOfWork.Reviews.GetByProductAndUserAsync(productId, userId, cancellationToken);
        return review is null ? null : ToDto(review);
    }

    public async Task<Result<ReviewDto>> CreateReviewAsync(int productId, int userId, CreateReviewRequestDto request, CancellationToken cancellationToken = default)
    {
        var product = await _unitOfWork.Products.GetByIdAsync(productId, cancellationToken);
        if (product is null)
        {
            return Result<ReviewDto>.Failure("Product not found.");
        }

        var existing = await _unitOfWork.Reviews.GetByProductAndUserAsync(productId, userId, cancellationToken);
        if (existing is not null)
        {
            return Result<ReviewDto>.Failure("You have already reviewed this product.");
        }

        var review = new Review
        {
            ProductId = productId,
            UserId = userId,
            Rating = request.Rating,
            Comment = request.Comment.Trim(),
            CreatedAt = DateTime.UtcNow
        };

        await _unitOfWork.Reviews.AddAsync(review, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await RecalculateProductRatingAsync(product, cancellationToken);

        var user = await _unitOfWork.Users.GetByIdAsync(userId, cancellationToken);
        return Result<ReviewDto>.Success(new ReviewDto(review.Id, userId, user?.Name ?? "Покупатель", review.Rating, review.Comment, review.CreatedAt));
    }

    public async Task<Result<bool>> DeleteMyReviewAsync(int productId, int userId, CancellationToken cancellationToken = default)
    {
        var review = await _unitOfWork.Reviews.GetByProductAndUserAsync(productId, userId, cancellationToken);
        if (review is null)
        {
            return Result<bool>.Failure("Review not found.");
        }

        _unitOfWork.Reviews.Remove(review);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var product = await _unitOfWork.Products.GetByIdAsync(productId, cancellationToken);
        if (product is not null)
        {
            await RecalculateProductRatingAsync(product, cancellationToken);
        }

        return Result<bool>.Success(true);
    }

    private async Task RecalculateProductRatingAsync(Domain.Entities.Product product, CancellationToken cancellationToken)
    {
        var (averageRating, reviewCount) = await _unitOfWork.Reviews.GetAggregateAsync(product.Id, cancellationToken);
        product.AverageRating = averageRating;
        product.ReviewCount = reviewCount;
        _unitOfWork.Products.Update(product);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private static ReviewDto ToDto(Review r) => new(r.Id, r.UserId, r.User?.Name ?? "Покупатель", r.Rating, r.Comment, r.CreatedAt);
}
