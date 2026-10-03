using Application.Common;
using Application.DTOs;
using Domain.Entities;

namespace Application.Interfaces;

public interface IOrderService
{
    Task<Result<OrderDto>> CreateOrderAsync(int userId, CreateOrderRequestDto request, CancellationToken cancellationToken = default);

    /// <summary>Creates an order once per (user, <paramref name="idempotencyKey"/>): repeating the key with the same body returns the
    /// saved answer (<see cref="Result{T}.IsReplay"/>) without a second order or a second stock write-off; a different body is
    /// <see cref="ResultErrorCodes.IdempotencyMismatch"/>. A null key behaves exactly like the overload without one.</summary>
    Task<Result<OrderDto>> CreateOrderAsync(int userId, CreateOrderRequestDto request, string? idempotencyKey, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<OrderDto>> GetOrdersByUserIdAsync(int userId, CancellationToken cancellationToken = default);
    Task<PagedResult<AdminOrderDto>> GetOrdersAsync(OrderFilterDto filter, CancellationToken cancellationToken = default);
    Task<Result<AdminOrderDto>> UpdateOrderStatusAsync(int orderId, OrderStatus newStatus, CancellationToken cancellationToken = default);
    Task<OrderStatsDto> GetStatsAsync(CancellationToken cancellationToken = default);
}
