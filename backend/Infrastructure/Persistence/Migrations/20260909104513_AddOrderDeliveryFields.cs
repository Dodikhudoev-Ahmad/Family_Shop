using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FamilyShop.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderDeliveryFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Address",
                table: "Orders",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "City",
                table: "Orders",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactName",
                table: "Orders",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ContactPhone",
                table: "Orders",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "DeliveryMethod",
                table: "Orders",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Size",
                table: "OrderItems",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Address",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "City",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ContactName",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ContactPhone",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "DeliveryMethod",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "Size",
                table: "OrderItems");
        }
    }
}
