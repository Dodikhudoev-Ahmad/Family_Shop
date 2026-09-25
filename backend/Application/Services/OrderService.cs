using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Entities;
using Domain.Interfaces;

namespace Application.Services;

public class OrderService : IOrderService
{
    private readonly IUnitOfWork _unitOfWork;

    public OrderService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<OrderDto>> CreateOrderAsync(int userId, CreateOrderRequestDto request, CancellationToken cancellationToken = default)
    {
        var order = new Order
        {
            UserId = userId,
            Status = OrderStatus.Created,
            CreatedAt = DateTime.UtcNow,
            ContactName = request.ContactName,
            ContactPhone = request.ContactPhone,
            DeliveryMethod = request.DeliveryMethod,
            City = request.DeliveryMethod == DeliveryMethod.Courier ? request.City : null,
            Address = request.DeliveryMethod == DeliveryMethod.Courier ? request.Address : null
        };

        var total = Domain.ValueObjects.Money.Zero;

        foreach (var item in request.Items)
        {
            var product = await _unitOfWork.Products.GetByIdAsync(item.ProductId, cancellationToken);
            if (product is null)
            {
                return Result<OrderDto>.Failure($"Product {item.ProductId} not found.");
            }

            if (product.Stock < item.Quantity)
            {
                return Result<OrderDto>.Failure($"Insufficient stock for product '{product.Name}'.");
            }

            var price = product.EffectivePrice;
            total += price * item.Quantity;
            product.Stock -= item.Quantity;

            order.Items.Add(new OrderItem
            {
                ProductId = item.ProductId,
                Product = product,
                Quantity = item.Quantity,
                Price = price,
                Size = item.Size
            });
        }

        order.TotalPrice = total;

        PromoCode? promoCode = null;

        if (!string.IsNullOrWhiteSpace(request.PromoCode))
        {
            var code = request.PromoCode.Trim().ToUpperInvariant();
            promoCode = await _unitOfWork.PromoCodes.GetByCodeAsync(code, cancellationToken);
            if (promoCode is null)
            {
                return Result<OrderDto>.Failure("Промокод не найден.");
            }

            var evaluation = PromoCodePolicy.Evaluate(promoCode, total.Amount, DateTime.UtcNow);
            if (!evaluation.IsSuccess)
            {
                return Result<OrderDto>.Failure(evaluation.Errors);
            }

            order.PromoCodeId = promoCode.Id;
            order.PromoCode = promoCode;
            order.DiscountAmount = new Domain.ValueObjects.Money(evaluation.Value!.DiscountAmount);
            order.TotalPrice = new Domain.ValueObjects.Money(evaluation.Value.FinalTotal);
        }

        await _unitOfWork.Orders.AddAsync(order, cancellationToken);

        if (promoCode is not null)
        {
            // Usage-limit check + increment happens as one atomic conditional UPDATE inside the
            // same transaction as the order insert, so a promo code can't be over-redeemed by
            // concurrent orders racing past the in-memory limit check above, and a failed order
            // never leaves a promo code's usage count incremented (or vice versa).
            var applied = await _unitOfWork.ExecuteInTransactionAsync(async ct =>
            {
                var incremented = await _unitOfWork.PromoCodes.TryIncrementUsageAsync(promoCode.Id, ct);
                if (!incremented)
                {
                    return false;
                }

                await _unitOfWork.SaveChangesAsync(ct);
                return true;
            }, cancellationToken);

            if (!applied)
            {
                return Result<OrderDto>.Failure("Промокод больше не действует (лимит использований исчерпан).");
            }
        }
        else
        {
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return Result<OrderDto>.Success(ToDto(order));
    }

    public async Task<IReadOnlyList<OrderDto>> GetOrdersByUserIdAsync(int userId, CancellationToken cancellationToken = default)
    {
        var orders = await _unitOfWork.Orders.GetByUserIdAsync(userId, cancellationToken);
        return orders.OrderByDescending(o => o.CreatedAt).Select(ToDto).ToList();
    }

    // Allowed forward transitions plus a cancellation escape hatch from either open state.
    private static readonly Dictionary<OrderStatus, OrderStatus[]> AllowedTransitions = new()
    {
        [OrderStatus.Created] = [OrderStatus.Processing, OrderStatus.Cancelled],
        [OrderStatus.Processing] = [OrderStatus.Shipped, OrderStatus.Cancelled],
        [OrderStatus.Shipped] = [OrderStatus.Delivered],
        [OrderStatus.Delivered] = [],
        [OrderStatus.Cancelled] = []
    };

    public async Task<PagedResult<AdminOrderDto>> GetOrdersAsync(OrderFilterDto filter, CancellationToken cancellationToken = default)
    {
        var sortOrder = filter.SortBy == OrderSortBy.Oldest ? OrderSortOrder.Oldest : OrderSortOrder.Newest;

        var (items, totalCount) = await _unitOfWork.Orders.GetByFilterAsync(
            filter.Status,
            filter.DateFrom,
            filter.DateTo,
            filter.Search,
            sortOrder,
            filter.Page,
            filter.PageSize,
            cancellationToken);

        return new PagedResult<AdminOrderDto>(items.Select(ToAdminDto).ToList(), totalCount, filter.Page, filter.PageSize);
    }

    public async Task<Result<AdminOrderDto>> UpdateOrderStatusAsync(int orderId, OrderStatus newStatus, CancellationToken cancellationToken = default)
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

        // A cancelled order never ships, so put its reserved stock back on sale - otherwise every
        // cancellation permanently shrinks the catalogue's available quantity.
        if (newStatus == OrderStatus.Cancelled && order.Status != OrderStatus.Cancelled)
        {
            foreach (var item in order.Items)
            {
                if (item.Product is not null)
                {
                    item.Product.Stock += item.Quantity;
                }
            }
        }

        order.Status = newStatus;
        _unitOfWork.Orders.Update(order);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<AdminOrderDto>.Success(ToAdminDto(order));
    }

    public async Task<OrderStatsDto> GetStatsAsync(CancellationToken cancellationToken = default)
    {
        var (ordersToday, revenueToday, newOrdersCount, totalOrders) = await _unitOfWork.Orders.GetStatsAsync(cancellationToken);
        return new OrderStatsDto(ordersToday, revenueToday, newOrdersCount, totalOrders);
    }

    private static AdminOrderDto ToAdminDto(Order order) => new(
        order.Id,
        order.Status,
        order.TotalPrice.Amount,
        order.CreatedAt,
        order.ContactName,
        order.ContactPhone,
        order.DeliveryMethod,
        order.City,
        order.Address,
        order.Items.Sum(i => i.Quantity),
        order.Items.Select(i => new OrderItemDto(
            i.ProductId,
            i.Product?.Name ?? "Товар удалён",
            i.Product?.Images.FirstOrDefault(),
            i.Quantity,
            i.Price.Amount,
            i.Size)).ToList(),
        order.PromoCode?.Code,
        order.DiscountAmount.Amount);

    private static OrderDto ToDto(Order order) => new(
        order.Id,
        order.Status,
        order.TotalPrice.Amount,
        order.CreatedAt,
        order.ContactName,
        order.ContactPhone,
        order.DeliveryMethod,
        order.City,
        order.Address,
        order.Items.Select(i => new OrderItemDto(
            i.ProductId,
            i.Product?.Name ?? "Товар удалён",
            i.Product?.Images.FirstOrDefault(),
            i.Quantity,
            i.Price.Amount,
            i.Size)).ToList(),
        order.PromoCode?.Code,
        order.DiscountAmount.Amount);
}
