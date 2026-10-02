using Domain.Entities;

namespace Domain.Interfaces;

public interface IUserRepository : IRepository<User>
{
    Task<User?> GetByEmailAsync(string email, CancellationToken cancellationToken = default);

    /// <summary>True while the user exists and has not deleted the account. Checked on every authenticated request.</summary>
    Task<bool> IsActiveAsync(int userId, CancellationToken cancellationToken = default);
}
