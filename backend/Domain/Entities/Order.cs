using Domain.ValueObjects;

namespace Domain.Entities;

public enum OrderStatus
{
    Created,
    Processing,
    Shipped,
    Delivered,
    Cancelled
}

public enum DeliveryMethod
{
    Courier,
    Pickup
}

public class Order
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.Created;
    public Money TotalPrice { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<OrderItem> Items { get; set; } = new();

    public string ContactName { get; set; } = string.Empty;
    public string ContactPhone { get; set; } = string.Empty;
    public DeliveryMethod DeliveryMethod { get; set; }
    public string? City { get; set; }
    public string? Address { get; set; }
}
