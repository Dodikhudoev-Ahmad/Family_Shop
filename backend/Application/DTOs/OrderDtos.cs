using Domain.Entities;

namespace Application.DTOs;

public record CreateOrderItemDto(int ProductId, int Quantity, string? Size);

public record CreateOrderRequestDto(
    List<CreateOrderItemDto> Items,
    string ContactName,
    string ContactPhone,
    DeliveryMethod DeliveryMethod,
    string? City,
    string? Address);

public record OrderItemDto(int ProductId, string ProductName, string? ProductImage, int Quantity, decimal Price, string? Size);

public record OrderDto(
    int Id,
    OrderStatus Status,
    decimal TotalPrice,
    DateTime CreatedAt,
    string ContactName,
    string ContactPhone,
    DeliveryMethod DeliveryMethod,
    string? City,
    string? Address,
    List<OrderItemDto> Items);

public enum OrderSortBy
{
    Newest,
    Oldest
}

public record OrderFilterDto(
    OrderStatus? Status = null,
    DateTime? DateFrom = null,
    DateTime? DateTo = null,
    string? Search = null,
    OrderSortBy SortBy = OrderSortBy.Newest,
    int Page = 1,
    int PageSize = 10);

public record AdminOrderDto(
    int Id,
    OrderStatus Status,
    decimal TotalPrice,
    DateTime CreatedAt,
    string ContactName,
    string ContactPhone,
    DeliveryMethod DeliveryMethod,
    string? City,
    string? Address,
    int ItemsCount,
    List<OrderItemDto> Items);

public record UpdateOrderStatusRequestDto(OrderStatus Status);

public record OrderStatsDto(
    int OrdersToday,
    decimal RevenueToday,
    int NewOrdersCount,
    int TotalOrders);
