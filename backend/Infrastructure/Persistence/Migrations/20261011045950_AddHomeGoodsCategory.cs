using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <summary>The data statements of <see cref="AddHomeGoodsCategory"/>, kept apart so the tests can run them again on a
    /// real database. Keyed by Slug / Name, never by Id; a second run changes nothing.</summary>
    public static class HomeGoodsCategorySql
    {
        /// <summary>The new top-level category (same values as the seeder's categorySpecs).</summary>
        public const string InsertCategory = """
            INSERT INTO "Categories" ("Name", "Slug", "HasSizes")
            SELECT 'Дом и быт', 'dom-i-byt', FALSE
            WHERE NOT EXISTS (SELECT 1 FROM "Categories" WHERE "Slug" = 'dom-i-byt');
            """;

        /// <summary>"Этажерка для обуви" was added to "Бытовая техника" by mistake: moved in place (same Id, so Reviews
        /// and OrderItems that reference ProductId stay intact). Only a row still sitting in "Бытовая техника" matches,
        /// so a second run - or a database without the product - touches nothing.</summary>
        public const string MoveShelf = """
            UPDATE "Products" p
            SET "CategoryId" = t."Id", "ProductType" = 'Этажерки'
            FROM "Categories" s, "Categories" t
            WHERE s."Slug" = 'bytovaya-tehnika'
              AND t."Slug" = 'dom-i-byt'
              AND p."CategoryId" = s."Id"
              AND p."Name" = 'Этажерка для обуви';
            """;
    }

    /// <inheritdoc />
    public partial class AddHomeGoodsCategory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Data-only and idempotent: the schema does not change, no row is deleted or recreated.
            migrationBuilder.Sql(HomeGoodsCategorySql.InsertCategory);
            migrationBuilder.Sql(HomeGoodsCategorySql.MoveShelf);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Best-effort reverse: put the shelf back and drop the category only while it is empty.
            migrationBuilder.Sql("""
                UPDATE "Products" p
                SET "CategoryId" = t."Id", "ProductType" = NULL
                FROM "Categories" s, "Categories" t
                WHERE s."Slug" = 'dom-i-byt'
                  AND t."Slug" = 'bytovaya-tehnika'
                  AND p."CategoryId" = s."Id"
                  AND p."Name" = 'Этажерка для обуви';
                """);

            migrationBuilder.Sql("""
                DELETE FROM "Categories" c
                WHERE c."Slug" = 'dom-i-byt'
                  AND NOT EXISTS (SELECT 1 FROM "Products" p WHERE p."CategoryId" = c."Id");
                """);
        }
    }
}
