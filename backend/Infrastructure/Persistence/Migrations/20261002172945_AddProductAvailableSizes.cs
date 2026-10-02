using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProductAvailableSizes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Additive and idempotent: re-running it (or running it on a database that already has the column) changes
            // nothing. No existing row is touched - NULL means "every size of the grid of the product's type", which is
            // exactly how every current product behaves, so production behaviour stays the same.
            migrationBuilder.Sql("ALTER TABLE \"Products\" ADD COLUMN IF NOT EXISTS \"AvailableSizes\" text[] NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER TABLE \"Products\" DROP COLUMN IF EXISTS \"AvailableSizes\";");
        }
    }
}
