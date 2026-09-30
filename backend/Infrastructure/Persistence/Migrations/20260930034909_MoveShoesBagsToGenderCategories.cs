using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class MoveShoesBagsToGenderCategories : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Data-only migration: "Обувь и сумки" stops being a top-level category and its
            // products join the category that matches their Gender (0 = Male -> men,
            // 1 = Female -> women, 2 = Kids -> kids). Product rows are updated in place (same
            // Ids), so Reviews and OrderItems - which reference ProductId - are untouched.

            // 1. Make sure every product keeps a ProductType before it loses its category
            //    (the first seeded shoes/bags predate the column and may still be NULL).
            migrationBuilder.Sql("""
                UPDATE "Products" p
                SET "ProductType" = CASE
                    WHEN p."Name" ILIKE '%кроссовк%' THEN 'Кроссовки'
                    WHEN p."Name" ILIKE '%ботинк%' THEN 'Ботинки'
                    WHEN p."Name" ILIKE '%сумк%' THEN 'Сумки'
                END
                FROM "Categories" c
                WHERE c."Slug" = 'shoes-bags' AND p."CategoryId" = c."Id" AND p."ProductType" IS NULL;
                """);

            // 2. Re-home products by gender.
            migrationBuilder.Sql("""
                UPDATE "Products" p
                SET "CategoryId" = t."Id"
                FROM "Categories" s, "Categories" t
                WHERE s."Slug" = 'shoes-bags'
                  AND p."CategoryId" = s."Id"
                  AND t."Slug" = CASE p."Gender" WHEN 0 THEN 'men' WHEN 1 THEN 'women' WHEN 2 THEN 'kids' END;
                """);

            // 3. Drop the now-empty category (guarded: never deletes one that still has products).
            migrationBuilder.Sql("""
                DELETE FROM "Categories" c
                WHERE c."Slug" = 'shoes-bags'
                  AND NOT EXISTS (SELECT 1 FROM "Products" p WHERE p."CategoryId" = c."Id");
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Best-effort reverse: recreate the category and pull shoes/bags back out of the
            // gender categories by ProductType (sport "Кроссовки" live elsewhere, so unaffected).
            migrationBuilder.Sql("""
                INSERT INTO "Categories" ("Name", "Slug", "HasSizes")
                SELECT 'Обувь и сумки', 'shoes-bags', TRUE
                WHERE NOT EXISTS (SELECT 1 FROM "Categories" WHERE "Slug" = 'shoes-bags');
                """);

            migrationBuilder.Sql("""
                UPDATE "Products" p
                SET "CategoryId" = (SELECT "Id" FROM "Categories" WHERE "Slug" = 'shoes-bags')
                FROM "Categories" c
                WHERE p."CategoryId" = c."Id"
                  AND c."Slug" IN ('women', 'men', 'kids')
                  AND p."ProductType" IN ('Ботинки', 'Кроссовки', 'Сумки');
                """);
        }
    }
}
