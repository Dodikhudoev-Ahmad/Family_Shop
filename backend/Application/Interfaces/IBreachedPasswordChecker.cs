namespace Application.Interfaces;

/// <summary>Asks whether a password is known from public data breaches. It must never block registration on its own failure:
/// when the answer cannot be obtained (service down, timeout, check switched off) the result is <c>false</c>.</summary>
public interface IBreachedPasswordChecker
{
    Task<bool> IsBreachedAsync(string password, CancellationToken cancellationToken = default);
}
