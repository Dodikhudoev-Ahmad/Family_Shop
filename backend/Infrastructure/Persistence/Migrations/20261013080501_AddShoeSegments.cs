using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddShoeSegments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Additive and idempotent (see ShoeSegmentsScript): two nullable columns and a fill of rows that have no value.
            migrationBuilder.Sql(ShoeSegmentsScript.Sql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER TABLE \"Products\" DROP COLUMN IF EXISTS \"ChildGender\";");
            migrationBuilder.Sql("ALTER TABLE \"Products\" DROP COLUMN IF EXISTS \"ShoeSegment\";");
        }
    }
}
