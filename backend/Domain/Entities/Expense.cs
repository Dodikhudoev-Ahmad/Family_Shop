namespace Domain.Entities;

public enum ExpenseCategory
{
    Purchase = 0,
    Delivery = 1,
    Other = 2
}

/// <summary>A manually entered shop expense. Positive whole tenge; created and read, never edited or deleted.</summary>
public class Expense
{
    public int Id { get; set; }
    public ExpenseCategory Category { get; set; }
    public decimal Amount { get; set; }

    /// <summary>The UTC instant at which the chosen calendar day of the shop begins (the shop's time zone, not UTC).</summary>
    public DateTime ExpenseDate { get; set; }

    public string? Comment { get; set; }
    public int CreatedByUserId { get; set; }
    public User? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
