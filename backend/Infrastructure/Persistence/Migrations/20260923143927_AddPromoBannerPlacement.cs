using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPromoBannerPlacement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PromoBanners_IsActive_SortOrder",
                table: "PromoBanners");

            migrationBuilder.AddColumn<int>(
                name: "Placement",
                table: "PromoBanners",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_PromoBanners_Placement_IsActive_SortOrder",
                table: "PromoBanners",
                columns: new[] { "Placement", "IsActive", "SortOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PromoBanners_Placement_IsActive_SortOrder",
                table: "PromoBanners");

            migrationBuilder.DropColumn(
                name: "Placement",
                table: "PromoBanners");

            migrationBuilder.CreateIndex(
                name: "IX_PromoBanners_IsActive_SortOrder",
                table: "PromoBanners",
                columns: new[] { "IsActive", "SortOrder" });
        }
    }
}
