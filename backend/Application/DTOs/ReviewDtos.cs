namespace Application.DTOs;

public enum ReviewSortBy
{
    Newest,
    HighestRating,
    LowestRating
}

public record ReviewFilterDto(ReviewSortBy SortBy = ReviewSortBy.Newest, int Page = 1, int PageSize = 10);

public record ReviewDto(int Id, int UserId, string UserName, int Rating, string Comment, DateTime CreatedAt);

public record CreateReviewRequestDto(int Rating, string Comment);

public record ReviewSummaryDto(
    decimal AverageRating,
    int ReviewCount,
    IReadOnlyDictionary<int, int> RatingCounts);
