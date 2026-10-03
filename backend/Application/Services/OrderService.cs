using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Entities;
using Domain.Interfaces;

namespace Application.Services;

public class OrderService : IOrderService
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly StoreClock _clock;

    public OrderService(IUnitOfWork unitOfWork, StoreClock? clock = null)
    {
        _unitOfWork = unitOfWork;
        _clock = clock ?? StoreClock.Default;
    }

    /// <summary>How long a saved response can be replayed. The cleanup job removes older rows.</summary>
    public static readonly TimeSpan IdempotencyKeyLifetime = TimeSpan.FromHours(24);

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public Task<Result<OrderDto>> CreateOrderAsync(int userId, CreateOrderRequestDto request, CancellationToken cancellationToken = default) =>
        CreateOrderAsync(userId, request, null, cancellationToken);

    public async Task<Result<OrderDto>> CreateOrderAsync(int userId, CreateOrderRequestDto request, string? idempotencyKey, CancellationToken cancellationToken = default)
    {
        string? requestHash = null;
        var notBefore = DateTime.UtcNow - IdempotencyKeyLifetime;
        if (idempotencyKey is not null)
        {
            requestHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(request, JsonOptions))));
            var saved = await _unitOfWork.IdempotencyKeys.GetAsync(userId, idempotencyKey, notBefore, cancellationToken);
            if (saved is not null)
            {
                return Replay(saved, requestHash);
            }
        }

        var contactName = request.ContactName?.Trim();
        if (string.IsNullOrEmpty(contactName))
        {
            var user = await _unitOfWork.Users.GetByIdAsync(userId, cancellationToken);
            contactName = user?.Name;
        }

        var order = new Order
        {
            UserId = userId,
            Status = OrderStatus.Created,
            CreatedAt = DateTime.UtcNow,
            ContactName = contactName ?? string.Empty,
            ContactPhone = request.ContactPhone,
            DeliveryMethod = request.DeliveryMethod,
            City = request.DeliveryMethod == DeliveryMethod.Courier ? request.City : null,
            Address = request.DeliveryMethod == DeliveryMethod.Courier ? request.Address : null
        };

        var total = Domain.ValueObjects.Money.Zero;

        var products = new Dictionary<int, Product>();
        var categories = new Dictionary<int, Category?>();

        foreach (var item in request.Items)
        {
            // A non-positive quantity would turn the conditional write-off below into a stock *increase*.
            if (item.Quantity <= 0)
            {
                return Result<OrderDto>.Failure("Quantity must be positive.");
            }

            // GetByIdAsync is a FindAsync: the same tracked Product instance comes back for repeated ids.
            // It is read only for name/price - the stock itself is written off atomically in the database below.
            var product = await _unitOfWork.Products.GetByIdAsync(item.ProductId, cancellationToken);
            if (product is null)
            {
                return Result<OrderDto>.Failure($"Product {item.ProductId} not found.");
            }

            products[product.Id] = product;

            // Only sizes the admin currently sells (or the whole grid of the type) can be ordered; a product without
            // sizes takes none. Stale carts and hand-made requests both end here, before anything is written off.
            if (!categories.TryGetValue(product.CategoryId, out var category))
            {
                category = await _unitOfWork.Categories.GetByIdAsync(product.CategoryId, cancellationToken);
                categories[product.CategoryId] = category;
            }

            var sellable = SizeGrids.Effective(product, category);
            var size = string.IsNullOrWhiteSpace(item.Size) ? null : item.Size;
            if (sellable.Count == 0 ? size is not null : size is null || !sellable.Contains(size))
            {
                return Result<OrderDto>.Failure(
                    $"Size '{size ?? string.Empty}' is not available for product '{product.Name}'.",
                    ResultErrorCodes.SizeUnavailable,
                    new Dictionary<string, object?> { ["productId"] = product.Id, ["productName"] = product.Name, ["size"] = size });
            }

            var price = product.EffectivePrice;
            total += price * item.Quantity;

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

        // Stock is shared by all sizes of a product, so demand is summed per product (a product may appear on
        // several lines). Rows are written off in ascending Id order: two concurrent orders then always take their
        // row locks in the same order and cannot deadlock each other.
        var demand = request.Items
            .GroupBy(i => i.ProductId)
            .Select(g => (ProductId: g.Key, Quantity: g.Sum(i => (long)i.Quantity)))
            .OrderBy(d => d.ProductId)
            .ToList();

        Result<OrderDto>? failure = null;
        int? shortProductId = null;

        // One transaction for everything that must stand or fall together: the conditional stock write-offs
        // (UPDATE ... WHERE Stock >= q, no read-check-write gap), the promo usage increment and the order insert.
        // Any refusal rolls the whole thing back, so a half-failed order never keeps stock or a promo use.
        var lostClaim = false;
        var committed = await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            // Claim the key first, before touching any stock: of two requests racing with one key the unique index lets one
            // through and holds the other here until the first commits (then it replays the saved answer) or rolls back.
            if (idempotencyKey is not null
                && !await _unitOfWork.IdempotencyKeys.TryClaimAsync(userId, idempotencyKey, requestHash!, DateTime.UtcNow, notBefore, ct))
            {
                lostClaim = true;
                return false;
            }

            foreach (var (productId, quantity) in demand)
            {
                if (quantity > int.MaxValue || !await _unitOfWork.Products.TryDecrementStockAsync(productId, (int)quantity, ct))
                {
                    shortProductId = productId;
                    return false;
                }
            }

            if (promoCode is not null && !await _unitOfWork.PromoCodes.TryIncrementUsageAsync(promoCode.Id, ct))
            {
                failure = Result<OrderDto>.Failure("Промокод больше не действует (лимит использований исчерпан).");
                return false;
            }

            await _unitOfWork.Orders.AddAsync(order, ct);
            await _unitOfWork.SaveChangesAsync(ct);

            // The saved answer is written in the same transaction as the order: either both exist or neither does.
            if (idempotencyKey is not null)
            {
                await _unitOfWork.IdempotencyKeys.CompleteAsync(
                    userId, idempotencyKey, 200, JsonSerializer.Serialize(ToDto(order), JsonOptions), ct);
            }

            return true;
        }, cancellationToken);

        if (!committed && lostClaim)
        {
            var winner = await _unitOfWork.IdempotencyKeys.GetAsync(userId, idempotencyKey!, notBefore, cancellationToken);
            return winner is null
                ? Result<OrderDto>.Failure("The request with this Idempotency-Key is still being processed.", ResultErrorCodes.Conflict)
                : Replay(winner, requestHash!);
        }

        if (!committed && shortProductId is int shortId)
        {
            // Read after the rollback, so this is what the next attempt will actually see.
            var available = Math.Max(0, await _unitOfWork.Products.GetStockAsync(shortId, cancellationToken) ?? 0);
            var name = products[shortId].Name;
            return Result<OrderDto>.Failure(
                $"Insufficient stock for product '{name}'.",
                ResultErrorCodes.OutOfStock,
                new Dictionary<string, object?> { ["productId"] = shortId, ["productName"] = name, ["available"] = available });
        }

        if (!committed)
        {
            return failure ?? Result<OrderDto>.Failure("Order could not be created.");
        }

        return Result<OrderDto>.Success(ToDto(order));
    }

    // A saved answer: the same body gets it back, a different body under the same key is a client bug.
    private static Result<OrderDto> Replay(IdempotencyKey saved, string requestHash)
    {
        if (!string.Equals(saved.RequestHash, requestHash, StringComparison.Ordinal))
        {
            return Result<OrderDto>.Failure(
                "This Idempotency-Key was already used with a different request.", ResultErrorCodes.IdempotencyMismatch);
        }

        var order = saved.ResponseBody is null ? null : JsonSerializer.Deserialize<OrderDto>(saved.ResponseBody, JsonOptions);
        return order is null
            ? Result<OrderDto>.Failure("The request with this Idempotency-Key is still being processed.", ResultErrorCodes.Conflict)
            : Result<OrderDto>.Replay(order);
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
            // The date inputs of the admin page are calendar days of the shop: "from" is the start of that local day,
            // "to" its last instant (the day itself is included).
            filter.DateFrom is { } from ? _clock.StartOfLocalDayUtc(from) : null,
            filter.DateTo is { } to ? _clock.EndOfLocalDayUtc(to) : null,
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

        if (order.Status == newStatus)
        {
            return Result<AdminOrderDto>.Success(ToAdminDto(order));
        }

        var previousStatus = order.Status;

        // The status flips with a compare-and-set (WHERE Status = previous), so of two racing requests exactly
        // one performs the transition. A cancelled order never ships, so that one - and only that one - puts the
        // reserved stock back on sale, in the same transaction; a repeated or racing cancel can't return it twice.
        var changed = await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            if (!await _unitOfWork.Orders.TryChangeStatusAsync(order.Id, previousStatus, newStatus, ct))
            {
                return false;
            }

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

        return Result<AdminOrderDto>.Success(ToAdminDto(order));
    }

    public async Task<OrderStatsDto> GetStatsAsync(CancellationToken cancellationToken = default)
    {
        // "Today" begins at the shop's local midnight (Store:TimeZone), whatever UTC says; dates stay stored in UTC.
        var (ordersToday, revenueToday, newOrdersCount, totalOrders) =
            await _unitOfWork.Orders.GetStatsAsync(_clock.StartOfTodayUtc(), cancellationToken);
        return new OrderStatsDto(ordersToday, revenueToday, newOrdersCount, totalOrders, _clock.ZoneId);
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
