using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Entities;
using Domain.Interfaces;

namespace Application.Services;

/// <summary>Orders facade. The work is split by reason to change: <see cref="OrderCreator"/> (placing an order),
/// <see cref="OrderStatusChanger"/> (status flow, stock return, ledger) and <see cref="OrderQueries"/> (lists and stats).</summary>
public class OrderService : IOrderService
{
    private readonly OrderCreator _creator;
    private readonly OrderStatusChanger _statusChanger;
    private readonly OrderQueries _queries;

    public OrderService(IUnitOfWork unitOfWork, StoreClock? clock = null)
    {
        _creator = new OrderCreator(unitOfWork);
        _statusChanger = new OrderStatusChanger(unitOfWork);
        _queries = new OrderQueries(unitOfWork, clock ?? StoreClock.Default);
    }

    /// <summary>How long a saved response can be replayed. The cleanup job removes older rows.</summary>
    public static readonly TimeSpan IdempotencyKeyLifetime = TimeSpan.FromHours(24);

    public Task<Result<OrderDto>> CreateOrderAsync(int userId, CreateOrderRequestDto request, CancellationToken cancellationToken = default) =>
        _creator.CreateAsync(userId, request, null, cancellationToken);

    public Task<Result<OrderDto>> CreateOrderAsync(int userId, CreateOrderRequestDto request, string? idempotencyKey, CancellationToken cancellationToken = default) =>
        _creator.CreateAsync(userId, request, idempotencyKey, cancellationToken);

    public Task<IReadOnlyList<OrderDto>> GetOrdersByUserIdAsync(int userId, CancellationToken cancellationToken = default) =>
        _queries.GetOrdersByUserIdAsync(userId, cancellationToken);

    public Task<PagedResult<AdminOrderDto>> GetOrdersAsync(OrderFilterDto filter, CancellationToken cancellationToken = default) =>
        _queries.GetOrdersAsync(filter, cancellationToken);

    public Task<Result<AdminOrderDto>> UpdateOrderStatusAsync(int orderId, OrderStatus newStatus, CancellationToken cancellationToken = default) =>
        _statusChanger.UpdateAsync(orderId, newStatus, cancellationToken);

    public Task<OrderStatsDto> GetStatsAsync(CancellationToken cancellationToken = default) =>
        _queries.GetStatsAsync(cancellationToken);
}
