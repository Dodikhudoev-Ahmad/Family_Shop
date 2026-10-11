using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <summary>The statements of <see cref="AddCategorySortOrder"/>, kept apart so the tests can run them again on a real
    /// database. Both are idempotent: a second run changes nothing.</summary>
    public static class CategorySortOrderSql
    {
        public const string AddColumn = """
            ALTER TABLE "Categories" ADD COLUMN IF NOT EXISTS "SortOrder" integer NOT NULL DEFAULT 0;
            """;

        /// <summary>Places the known categories by Slug (same values as <c>Domain.Entities.CategorySortOrder</c>), and only
        /// those still at 0: an order set by hand, or by an earlier run, is never overwritten. No row is created or removed.</summary>
        public const string SetOrder = """
            UPDATE "Categories" c
            SET "SortOrder" = v."Order"
            FROM (VALUES
                ('women', 10), ('men', 20), ('kids', 30), ('bytovaya-tehnika', 40),
                ('dom-i-byt', 50), ('posuda', 60), ('sport', 70), ('aksessuary', 80)
            ) AS v("Slug", "Order")
            WHERE c."Slug" = v."Slug" AND c."SortOrder" = 0;
            """;
    }

    /// <inheritdoc />
    public partial class AddCategorySortOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(CategorySortOrderSql.AddColumn);
            migrationBuilder.Sql(CategorySortOrderSql.SetOrder);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""ALTER TABLE "Categories" DROP COLUMN IF EXISTS "SortOrder";""");
        }
    }
}
