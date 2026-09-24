using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Api.Common;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;

namespace Api.Controllers;

/// <summary>Отзывы и рейтинги товаров.</summary>
[ApiController]
[Route("api/v1/products/{productId:int}/reviews")]
public class ReviewsController : ControllerBase
{
    private readonly IReviewService _reviewService;

    public ReviewsController(IReviewService reviewService)
    {
        _reviewService = reviewService;
    }

    /// <summary>Список отзывов товара с сортировкой (новые/высокий рейтинг/низкий рейтинг) и пагинацией.</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<ReviewDto>>>> GetReviews(
        int productId,
        [FromQuery] ReviewSortBy sortBy = ReviewSortBy.Newest,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        CancellationToken cancellationToken = default)
    {
        var filter = new ReviewFilterDto(sortBy, page, pageSize);
        var result = await _reviewService.GetReviewsAsync(productId, filter, cancellationToken);
        return Ok(ApiResponse<PagedResult<ReviewDto>>.Ok(result));
    }

    /// <summary>Средний рейтинг, число отзывов и распределение по звёздам.</summary>
    [HttpGet("summary")]
    public async Task<ActionResult<ApiResponse<ReviewSummaryDto>>> GetSummary(int productId, CancellationToken cancellationToken)
    {
        var result = await _reviewService.GetSummaryAsync(productId, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<ReviewSummaryDto>.Ok(result.Value!))
            : NotFound(ApiResponse<ReviewSummaryDto>.Fail(result.Errors));
    }

    /// <summary>Отзыв текущего пользователя на товар, если он уже оставлен.</summary>
    [HttpGet("mine")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<ReviewDto?>>> GetMine(int productId, CancellationToken cancellationToken)
    {
        var review = await _reviewService.GetMyReviewAsync(productId, GetUserId(), cancellationToken);
        return Ok(ApiResponse<ReviewDto?>.Ok(review));
    }

    /// <summary>Оставить отзыв: один пользователь — один отзыв на товар.</summary>
    [HttpPost]
    [Authorize]
    [EnableRateLimiting("review-create")]
    public async Task<ActionResult<ApiResponse<ReviewDto>>> CreateReview(int productId, CreateReviewRequestDto request, CancellationToken cancellationToken)
    {
        var result = await _reviewService.CreateReviewAsync(productId, GetUserId(), request, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<ReviewDto>.Ok(result.Value!))
            : BadRequest(ApiResponse<ReviewDto>.Fail(result.Errors));
    }

    /// <summary>Удаление своего отзыва.</summary>
    [HttpDelete]
    [Authorize]
    public async Task<ActionResult<ApiResponse<bool>>> DeleteMyReview(int productId, CancellationToken cancellationToken)
    {
        var result = await _reviewService.DeleteMyReviewAsync(productId, GetUserId(), cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<bool>.Ok(true))
            : NotFound(ApiResponse<bool>.Fail(result.Errors));
    }

    private int GetUserId() => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
