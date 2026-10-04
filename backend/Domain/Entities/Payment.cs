namespace Domain.Entities;

public enum PaymentType
{
    /// <summary>Money received for an order (created once, when the order becomes Delivered).</summary>
    Income = 0,

    /// <summary>Storno: the income of a completed order taken back (same amount, at most one per order).</summary>
    Reversal = 1
}

/// <summary>
/// One line of the shop's money ledger. Append-only: a payment is never edited or deleted, a mistake is corrected by a
/// <see cref="PaymentType.Reversal"/>. The amount is always positive whole tenge; the type gives the sign. Unique on
/// (OrderId, Type), so an order has at most one income and at most one reversal, whatever races or retries happen.
/// </summary>
public class Payment
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order? Order { get; set; }
    public PaymentType Type { get; set; }
    public decimal Amount { get; set; }

    /// <summary>When the money moved (UTC): the moment the order was delivered; for a backfilled row the order's creation date.</summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
