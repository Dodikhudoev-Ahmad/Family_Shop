using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddExpenseSoftDelete : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Additive and idempotent: three nullable-or-defaulted columns added IF NOT EXISTS (existing expenses are kept
            // as they are and get IsDeleted = false), the foreign key only when it is missing, the index IF NOT EXISTS.
            // Nothing is dropped or rewritten, and no row of Orders, OrderItems or Reviews is touched.
            migrationBuilder.Sql(@"
ALTER TABLE ""Expenses"" ADD COLUMN IF NOT EXISTS ""IsDeleted"" boolean NOT NULL DEFAULT FALSE;
ALTER TABLE ""Expenses"" ADD COLUMN IF NOT EXISTS ""DeletedAt"" timestamp with time zone NULL;
ALTER TABLE ""Expenses"" ADD COLUMN IF NOT EXISTS ""DeletedByUserId"" integer NULL;
CREATE INDEX IF NOT EXISTS ""IX_Expenses_DeletedByUserId"" ON ""Expenses"" (""DeletedByUserId"");
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_Expenses_Users_DeletedByUserId') THEN
        ALTER TABLE ""Expenses"" ADD CONSTRAINT ""FK_Expenses_Users_DeletedByUserId""
            FOREIGN KEY (""DeletedByUserId"") REFERENCES ""Users"" (""Id"") ON DELETE RESTRICT;
    END IF;
END $$;
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
ALTER TABLE ""Expenses"" DROP CONSTRAINT IF EXISTS ""FK_Expenses_Users_DeletedByUserId"";
DROP INDEX IF EXISTS ""IX_Expenses_DeletedByUserId"";
ALTER TABLE ""Expenses"" DROP COLUMN IF EXISTS ""DeletedByUserId"", DROP COLUMN IF EXISTS ""DeletedAt"", DROP COLUMN IF EXISTS ""IsDeleted"";
");
        }
    }
}
