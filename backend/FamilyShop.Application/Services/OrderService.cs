using FamilyShop.Application.Common;
using FamilyShop.Application.DTOs;
using FamilyShop.Application.Interfaces;
using FamilyShop.Domain.Entities;
using FamilyShop.Domain.Interfaces;

namespace FamilyShop.Application.Services;

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

        await _unitOfWork.Orders.AddAsync(order, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

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
            i.Size)).ToList());

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
            i.Size)).ToList());
}
