using FamilyShop.Application.Common;
using FamilyShop.Application.DTOs;

namespace FamilyShop.Application.Interfaces;

public interface IOrderService
{
    Task<Result<OrderDto>> CreateOrderAsync(int userId, CreateOrderRequestDto request, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<OrderDto>> GetOrdersByUserIdAsync(int userId, CancellationToken cancellationToken = default);
}
