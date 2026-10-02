using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Api.Common;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Entities;

namespace Api.Controllers;

/// <summary>Управление заказами для администратора.</summary>
[ApiController]
[Route("api/v1/admin/orders")]
[Authorize(Roles = "Admin")]
public class AdminOrdersController : ControllerBase
{
    private readonly IOrderService _orderService;
    private readonly IValidator<OrderFilterDto> _filterValidator;

    public AdminOrdersController(IOrderService orderService, IValidator<OrderFilterDto> filterValidator)
    {
        _orderService = orderService;
        _filterValidator = filterValidator;
    }

    /// <summary>Список заказов с фильтрацией по статусу, диапазону дат, поиском по имени/телефону/номеру, сортировкой и пагинацией.</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<AdminOrderDto>>>> GetOrders(
        [FromQuery] OrderStatus? status,
        [FromQuery] DateTime? dateFrom,
        [FromQuery] DateTime? dateTo,
        [FromQuery] string? search,
        [FromQuery] OrderSortBy sortBy = OrderSortBy.Newest,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        CancellationToken cancellationToken = default)
    {
        var filter = new OrderFilterDto(status, dateFrom, dateTo, search, sortBy, page, pageSize);
        var errors = await _filterValidator.ValidateOrNullAsync(filter, cancellationToken);
        if (errors is not null)
        {
            return BadRequest(ApiResponse<PagedResult<AdminOrderDto>>.Fail(errors));
        }

        var result = await _orderService.GetOrdersAsync(filter, cancellationToken);
        return Ok(ApiResponse<PagedResult<AdminOrderDto>>.Ok(result));
    }

    /// <summary>Ключевые метрики для дашборда: заказы и выручка за сегодня, число новых заказов, всего заказов.</summary>
    [HttpGet("stats")]
    public async Task<ActionResult<ApiResponse<OrderStatsDto>>> GetStats(CancellationToken cancellationToken)
    {
        var stats = await _orderService.GetStatsAsync(cancellationToken);
        return Ok(ApiResponse<OrderStatsDto>.Ok(stats));
    }

    /// <summary>Смена статуса заказа с валидацией допустимых переходов.</summary>
    [HttpPatch("{id:int}/status")]
    public async Task<ActionResult<ApiResponse<AdminOrderDto>>> UpdateStatus(int id, UpdateOrderStatusRequestDto request, CancellationToken cancellationToken)
    {
        var result = await _orderService.UpdateOrderStatusAsync(id, request.Status, cancellationToken);
        if (result.IsSuccess)
        {
            return Ok(ApiResponse<AdminOrderDto>.Ok(result.Value!));
        }

        var failure = ApiResponse<AdminOrderDto>.Fail(result.Errors);
        return result.ErrorCode is ResultErrorCodes.OutOfStock or ResultErrorCodes.Conflict
            ? Conflict(failure)
            : BadRequest(failure);
    }
}
