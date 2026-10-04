namespace Domain.Entities;

public enum ExpenseCategory
{
    Purchase = 0,
    Delivery = 1,
    Other = 2
}

/// <summary>A manually entered shop expense. Positive whole tenge; never edited. A mistake is removed with a soft delete
/// (<see cref="IsDeleted"/>: the row stays for the record but counts nowhere) and entered again.</summary>
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

    public bool IsDeleted { get; set; }

    /// <summary>When it was deleted (UTC); set once, by the first delete.</summary>
    public DateTime? DeletedAt { get; set; }

    public int? DeletedByUserId { get; set; }
    public User? DeletedBy { get; set; }
}
