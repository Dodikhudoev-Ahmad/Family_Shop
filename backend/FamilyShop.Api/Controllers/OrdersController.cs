using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FamilyShop.Api.Common;
using FamilyShop.Application.DTOs;
using FamilyShop.Application.Interfaces;

namespace FamilyShop.Api.Controllers;

/// <summary>Заказы пользователя.</summary>
[ApiController]
[Route("api/v1/orders")]
[Authorize]
public class OrdersController : ControllerBase
{
    private readonly IOrderService _orderService;

    public OrdersController(IOrderService orderService)
    {
        _orderService = orderService;
    }

    /// <summary>Создание заказа из текущего пользователя (id берётся из access-токена, не из тела запроса).</summary>
    [HttpPost]
    public async Task<ActionResult<ApiResponse<OrderDto>>> CreateOrder(CreateOrderRequestDto request, CancellationToken cancellationToken)
    {
        var result = await _orderService.CreateOrderAsync(GetUserId(), request, cancellationToken);
        return result.IsSuccess
            ? Ok(ApiResponse<OrderDto>.Ok(result.Value!))
            : BadRequest(ApiResponse<OrderDto>.Fail(result.Errors));
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
