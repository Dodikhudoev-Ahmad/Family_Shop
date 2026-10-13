namespace Infrastructure.Persistence;

/// <summary>
/// The SQL of migration <c>AddShoeSegments</c>, kept here (like <see cref="ProductUpdatedAtScript"/>) so a test can run the
/// very same script repeatedly against a real database. Must not change once released. Additive and idempotent: two
/// nullable columns, then only rows that have no value yet are filled, so a repeat (or an admin's later edit) is never
/// overwritten and no row is deleted or recreated.
/// Segment: shoes (types Ботинки/Кроссовки) in a category with sizes take the segment their <c>Gender</c> already says
/// (0 Male -> Men 0, 1 Female -> Women 1, 2 Kids -> Kids 2). The teen group (3) is never guessed.
/// Boy/girl: only a kids' shoe whose name says exactly one of them in words; anything else stays NULL for the admin.
/// Shoes in categories without sizes (HasSizes = false) are left alone: they have no size grid today.
/// </summary>
public static class ShoeSegmentsScript
{
    public const string Sql = @"
ALTER TABLE ""Products"" ADD COLUMN IF NOT EXISTS ""ShoeSegment"" integer NULL;
ALTER TABLE ""Products"" ADD COLUMN IF NOT EXISTS ""ChildGender"" integer NULL;

UPDATE ""Products"" p
SET ""ShoeSegment"" = CASE p.""Gender"" WHEN 0 THEN 0 WHEN 1 THEN 1 ELSE 2 END
FROM ""Categories"" c
WHERE c.""Id"" = p.""CategoryId""
  AND c.""HasSizes""
  AND p.""ProductType"" IN ('Ботинки', 'Кроссовки')
  AND p.""ShoeSegment"" IS NULL;

UPDATE ""Products""
SET ""ChildGender"" = CASE WHEN ""Name"" ~* 'девоч' THEN 1 ELSE 0 END
WHERE ""ShoeSegment"" IN (2, 3)
  AND ""ChildGender"" IS NULL
  AND ((""Name"" ~* 'девоч') <> (""Name"" ~* 'мальчик'));
";
}
