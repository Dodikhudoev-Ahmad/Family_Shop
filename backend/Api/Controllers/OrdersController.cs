using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Api.Common;
using Api.RateLimiting;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;

namespace Api.Controllers;

/// <summary>Заказы пользователя.</summary>
[ApiController]
[Route("api/v1/orders")]
[Authorize]
public class OrdersController : ControllerBase
{
    public const string IdempotencyKeyHeader = "Idempotency-Key";

    private static readonly System.Text.RegularExpressions.Regex IdempotencyKeyFormat =
        new("^[A-Za-z0-9._:-]{8,100}$", System.Text.RegularExpressions.RegexOptions.Compiled);

    private readonly IOrderService _orderService;

    public OrdersController(IOrderService orderService)
    {
        _orderService = orderService;
    }

    /// <summary>Создание заказа из текущего пользователя (id берётся из access-токена, не из тела запроса).</summary>
    /// <remarks>Optional <c>Idempotency-Key</c> header (a client-generated UUID): repeating it with the same body returns the first
    /// answer (header <c>Idempotent-Replayed: true</c>) instead of a second order; a different body under the same key is 422.
    /// Keys are kept for 24 hours.</remarks>
    [HttpPost]
    [EnableRateLimiting(RateLimitPolicies.OrderCreate)]
    public async Task<ActionResult<ApiResponse<OrderDto>>> CreateOrder(
        CreateOrderRequestDto request,
        [FromHeader(Name = IdempotencyKeyHeader)] string? idempotencyKey,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey))
        {
            idempotencyKey = null;
        }
        else if (!IdempotencyKeyFormat.IsMatch(idempotencyKey))
        {
            return BadRequest(ApiResponse<OrderDto>.Fail("Idempotency-Key must be 8-100 characters: letters, digits, '-', '_', '.', ':'."));
        }

        var result = await _orderService.CreateOrderAsync(GetUserId(), request, idempotencyKey, cancellationToken);
        if (result.IsSuccess)
        {
            if (result.IsReplay)
            {
                Response.Headers["Idempotent-Replayed"] = "true";
            }

            return Ok(ApiResponse<OrderDto>.Ok(result.Value!));
        }

        var failure = ApiResponse<OrderDto>.Fail(result.Errors, result.ErrorCode, result.ErrorMeta);
        return result.ErrorCode switch
        {
            ResultErrorCodes.OutOfStock or ResultErrorCodes.Conflict or ResultErrorCodes.SizeUnavailable => Conflict(failure),
            ResultErrorCodes.IdempotencyMismatch => UnprocessableEntity(failure),
            _ => BadRequest(failure)
        };
    }

    /// <summary>История заказов текущего пользователя (id берётся из access-токена, не из query).</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<OrderDto>>>> GetOrders(CancellationToken cancellationToken)
    {
        var orders = await _orderService.GetOrdersByUserIdAsync(GetUserId(), cancellationToken);
        return Ok(ApiResponse<IReadOnlyList<OrderDto>>.Ok(orders));
    }

    private int GetUserId() => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
