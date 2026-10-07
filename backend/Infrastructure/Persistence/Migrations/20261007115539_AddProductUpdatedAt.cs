using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProductUpdatedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Additive and idempotent (see ProductUpdatedAtScript): existing products get UpdatedAt = CreatedAt, nothing is
            // deleted or recreated, Orders/OrderItems/Reviews are not touched.
            migrationBuilder.Sql(ProductUpdatedAtScript.Sql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER TABLE \"Products\" DROP COLUMN IF EXISTS \"UpdatedAt\";");
        }
    }
}
