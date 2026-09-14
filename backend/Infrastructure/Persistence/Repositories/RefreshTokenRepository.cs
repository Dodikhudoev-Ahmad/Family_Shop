using Microsoft.EntityFrameworkCore;
using FamilyShop.Domain.Entities;
using FamilyShop.Domain.Interfaces;

namespace FamilyShop.Infrastructure.Persistence.Repositories;

public class RefreshTokenRepository : RepositoryBase<RefreshToken>, IRefreshTokenRepository
{
    public RefreshTokenRepository(AppDbContext context) : base(context)
    {
    }

    public async Task<RefreshToken?> GetByTokenHashAsync(string tokenHash, CancellationToken cancellationToken = default)
    {
        return await DbSet.Include(rt => rt.User).FirstOrDefaultAsync(rt => rt.TokenHash == tokenHash, cancellationToken);
    }
}
