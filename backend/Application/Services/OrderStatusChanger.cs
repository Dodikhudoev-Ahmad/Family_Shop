using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Entities;
using Domain.Interfaces;

namespace Application.Services;

/// <summary>Order status transitions: the allowed graph, the compare-and-set flip, stock return on cancel and the
/// money ledger entry, all in one transaction. Used by <see cref="OrderService"/>.</summary>
internal sealed class OrderStatusChanger
{
    private readonly IUnitOfWork _unitOfWork;

    public OrderStatusChanger(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    // Allowed forward transitions plus a cancellation escape hatch from every open state (a shipped parcel can still
    // fail to arrive or be refused; its stock goes back on sale like any other cancellation).
    private static readonly Dictionary<OrderStatus, OrderStatus[]> AllowedTransitions = new()
    {
        [OrderStatus.Created] = [OrderStatus.Processing, OrderStatus.Cancelled],
        [OrderStatus.Processing] = [OrderStatus.Shipped, OrderStatus.Cancelled],
        [OrderStatus.Shipped] = [OrderStatus.Delivered, OrderStatus.Cancelled],
        [OrderStatus.Delivered] = [],
        [OrderStatus.Cancelled] = []
    };

    public async Task<Result<AdminOrderDto>> UpdateAsync(int orderId, OrderStatus newStatus, CancellationToken cancellationToken = default)
    {
        var order = await _unitOfWork.Orders.GetByIdWithItemsAsync(orderId, cancellationToken);
        if (order is null)
        {
            return Result<AdminOrderDto>.Failure("Order not found.");
        }

        if (order.Status != newStatus && !AllowedTransitions[order.Status].Contains(newStatus))
        {
            return Result<AdminOrderDto>.Failure($"Cannot transition order from '{order.Status}' to '{newStatus}'.");
        }

        if (order.Status == newStatus)
        {
            return Result<AdminOrderDto>.Success(OrderMapper.ToAdminDto(order));
        }

        var previousStatus = order.Status;

        // The status flips with a compare-and-set (WHERE Status = previous), so of two racing requests exactly
        // one performs the transition. A cancelled order never ships or arrives, so that one - and only that one - puts the
        // reserved stock back on sale, in the same transaction; a repeated or racing cancel can't return it twice. The
        // same holds for the money ledger: only the winner records the income of a delivery.
        var changed = await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            if (!await _unitOfWork.Orders.TryChangeStatusAsync(order.Id, previousStatus, newStatus, ct))
            {
                return false;
            }

            await OrderLedger.RecordTransitionAsync(
                _unitOfWork.Payments, order.Id, order.TotalPrice.Amount, previousStatus, newStatus, DateTime.UtcNow, ct);

            if (newStatus == OrderStatus.Cancelled)
            {
                var returns = order.Items
                    .GroupBy(i => i.ProductId)
                    .Select(g => (ProductId: g.Key, Quantity: g.Sum(i => i.Quantity)))
                    .OrderBy(r => r.ProductId);

                foreach (var (productId, quantity) in returns)
                {
                    await _unitOfWork.Products.IncrementStockAsync(productId, quantity, ct);
                }
            }

            return true;
        }, cancellationToken);

        if (!changed)
        {
            return Result<AdminOrderDto>.Failure("The order was changed by another request. Reload and try again.", ResultErrorCodes.Conflict);
        }

        order.Status = newStatus;

        return Result<AdminOrderDto>.Success(OrderMapper.ToAdminDto(order));
    }
}
