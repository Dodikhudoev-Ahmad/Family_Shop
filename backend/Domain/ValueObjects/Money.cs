namespace Domain.ValueObjects;

public readonly record struct Money
{
    public decimal Amount { get; }

    public Money(decimal amount)
    {
        if (amount < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(amount), "Money amount cannot be negative.");
        }

        Amount = amount;
    }

    public static Money Zero => new(0);

    public static Money operator +(Money a, Money b) => new(a.Amount + b.Amount);
    public static Money operator *(Money a, int quantity) => new(a.Amount * quantity);

    public static bool operator >(Money a, Money b) => a.Amount > b.Amount;
    public static bool operator <(Money a, Money b) => a.Amount < b.Amount;
    public static bool operator >=(Money a, Money b) => a.Amount >= b.Amount;
    public static bool operator <=(Money a, Money b) => a.Amount <= b.Amount;

    public override string ToString() => Amount.ToString("0.00");
}
