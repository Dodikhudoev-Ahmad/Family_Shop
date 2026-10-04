using Domain.Entities;
using Domain.ValueObjects;
using Infrastructure.Persistence;

namespace Application.Tests.Integration;

/// <summary>Rows for the finance tests, written straight to the database of a <see cref="PostgresFixture"/>.</summary>
internal sealed class FinanceTestData
{
    private readonly PostgresFixture _db;

    public FinanceTestData(PostgresFixture db) => _db = db;

    public int UserId { get; private set; }
    public int AdminId { get; private set; }
    public int ProductId { get; private set; }

    public async Task<FinanceTestData> SeedAsync(int stock = 100)
    {
        await using var ctx = _db.CreateContext();
        var user = new User { Email = new Email($"u{Guid.NewGuid():N}@example.com"), Name = "Покупатель", PasswordHash = "x" };
        var admin = new User { Email = new Email($"a{Guid.NewGuid():N}@example.com"), Name = "Админ", PasswordHash = "x", Role = UserRole.Admin };
        var category = new Category { Name = "T", Slug = $"t-{Guid.NewGuid():N}", HasSizes = false };
        ctx.AddRange(user, admin, category);
        await ctx.SaveChangesAsync();
        var product = new Product { Name = "P", Price = new Money(1000), Stock = stock, CategoryId = category.Id };
        ctx.Add(product);
        await ctx.SaveChangesAsync();
        UserId = user.Id;
        AdminId = admin.Id;
        ProductId = product.Id;
        return this;
    }

    /// <summary>Another administrator (for "who deleted it" checks).</summary>
    public async Task<int> AddAdminAsync(string name = "Второй админ")
    {
        await using var ctx = _db.CreateContext();
        var admin = new User { Email = new Email($"a{Guid.NewGuid():N}@example.com"), Name = name, PasswordHash = "x", Role = UserRole.Admin };
        ctx.Add(admin);
        await ctx.SaveChangesAsync();
        return admin.Id;
    }

    public async Task<int> AddOrderAsync(decimal total, OrderStatus status, DateTime? createdAt = null)
    {
        await using var ctx = _db.CreateContext();
        var order = new Order
        {
            UserId = UserId, Status = status, CreatedAt = createdAt ?? DateTime.UtcNow,
            TotalPrice = new Money(total), ContactName = "T", ContactPhone = "+7"
        };
        order.Items.Add(new OrderItem { ProductId = ProductId, Quantity = 1, Price = new Money(total) });
        ctx.Add(order);
        await ctx.SaveChangesAsync();
        return order.Id;
    }

    public async Task<int> AddPaymentAsync(int orderId, PaymentType type, decimal amount, DateTime at)
    {
        await using var ctx = _db.CreateContext();
        var payment = new Payment { OrderId = orderId, Type = type, Amount = amount, CreatedAt = at };
        ctx.Add(payment);
        await ctx.SaveChangesAsync();
        return payment.Id;
    }

    public async Task<int> AddExpenseAsync(decimal amount, DateTime expenseDateUtc, ExpenseCategory category = ExpenseCategory.Other, string? comment = null)
    {
        await using var ctx = _db.CreateContext();
        var expense = new Expense
        {
            Category = category, Amount = amount, ExpenseDate = expenseDateUtc, Comment = comment, CreatedByUserId = AdminId
        };
        ctx.Add(expense);
        await ctx.SaveChangesAsync();
        return expense.Id;
    }
}
