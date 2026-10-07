namespace Infrastructure.Persistence;

/// <summary>
/// The SQL of migration <c>AddProductUpdatedAt</c>, kept here (like <see cref="PaymentBackfill"/>) so a test can run the very
/// same script repeatedly against a real database. Must not change once released. Additive and idempotent: the column is added
/// nullable, only rows without a value are filled (with the product's <c>CreatedAt</c>, so an edit made after the first run is
/// never overwritten by a repeat), then the column gets <c>DEFAULT now()</c> - the code of the previous release, which does not
/// know the column, can still insert products after a code rollback - and <c>NOT NULL</c>. No row is deleted or recreated.
/// </summary>
public static class ProductUpdatedAtScript
{
    public const string Sql = @"
ALTER TABLE ""Products"" ADD COLUMN IF NOT EXISTS ""UpdatedAt"" timestamp with time zone NULL;
UPDATE ""Products"" SET ""UpdatedAt"" = ""CreatedAt"" WHERE ""UpdatedAt"" IS NULL;
ALTER TABLE ""Products"" ALTER COLUMN ""UpdatedAt"" SET DEFAULT now();
ALTER TABLE ""Products"" ALTER COLUMN ""UpdatedAt"" SET NOT NULL;
";
}
