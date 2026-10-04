namespace Infrastructure.Persistence;

/// <summary>
/// The one-off backfill of the money ledger: an income for every order that is already Delivered. It lives here, and not
/// inline in the migration, so that a test can run the very same statement twice against a real database and show that
/// the second run changes nothing. The statement is part of migration <c>AddFinance</c> and must not change afterwards.
/// </summary>
public static class PaymentBackfill
{
    /// <summary>
    /// <c>Status = 3</c> is <c>OrderStatus.Delivered</c>. An order has no delivery timestamp, so the income is dated with
    /// the order's creation. The amount is the total rounded to whole tenge (numeric ROUND is half away from zero, like the
    /// service); an order whose total rounds to 0 (a 100% promo) brought no money and gets no income. Cancelled and open
    /// orders get nothing. The unique index (OrderId, Type) makes a repeat run insert nothing.
    /// </summary>
    public const string Sql = @"
INSERT INTO ""Payments"" (""OrderId"", ""Type"", ""Amount"", ""CreatedAt"")
SELECT o.""Id"", 0, ROUND(o.""TotalPrice"", 0), o.""CreatedAt""
FROM ""Orders"" o
WHERE o.""Status"" = 3 AND ROUND(o.""TotalPrice"", 0) > 0
ON CONFLICT (""OrderId"", ""Type"") DO NOTHING;
";
}
