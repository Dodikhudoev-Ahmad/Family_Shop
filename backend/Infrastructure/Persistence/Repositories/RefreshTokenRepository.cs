using Microsoft.EntityFrameworkCore;
using Domain.Entities;
using Domain.Interfaces;

namespace Infrastructure.Persistence.Repositories;

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
