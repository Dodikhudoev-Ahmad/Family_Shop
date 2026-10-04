namespace Application.Common;

/// <summary>Money of the finance module is whole tenge.</summary>
public static class FinanceMoney
{
    /// <summary>Nearest whole tenge, .5 away from zero (same rule as the percentage discount, see docs/Money.md).</summary>
    public static decimal WholeTenge(decimal amount) => Math.Round(amount, 0, MidpointRounding.AwayFromZero);

    public static bool IsWholeTenge(decimal amount) => amount == decimal.Truncate(amount);
}
