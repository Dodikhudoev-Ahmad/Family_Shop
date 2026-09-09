using FamilyShop.Domain.Entities;

namespace FamilyShop.Application.DTOs;

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
