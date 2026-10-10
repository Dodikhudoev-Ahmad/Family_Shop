using Application.Interfaces;

namespace Infrastructure.Security;

/// <summary>The default: <c>Auth:BreachCheck</c> is off, nothing is sent anywhere.</summary>
public sealed class NoBreachedPasswordCheck : IBreachedPasswordChecker
{
    public Task<bool> IsBreachedAsync(string password, CancellationToken cancellationToken = default) => Task.FromResult(false);
}
