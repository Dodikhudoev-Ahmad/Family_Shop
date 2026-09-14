using Microsoft.EntityFrameworkCore;
using Domain.Entities;
using Domain.Interfaces;
using Domain.ValueObjects;

namespace Infrastructure.Persistence.Repositories;

public class UserRepository : RepositoryBase<User>, IUserRepository
{
    public UserRepository(AppDbContext context) : base(context)
    {
    }

    public async Task<User?> GetByEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        var normalized = new Email(email);
        return await DbSet.FirstOrDefaultAsync(u => u.Email == normalized, cancellationToken);
    }
}
