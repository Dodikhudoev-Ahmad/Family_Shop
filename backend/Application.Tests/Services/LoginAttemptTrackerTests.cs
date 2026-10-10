using Xunit;
using Application.Common;

namespace Application.Tests.Services;

/// <summary>The per-account pause after repeated wrong passwords: starts at the 5th failure, grows, expires, resets.</summary>
public class LoginAttemptTrackerTests
{
    private DateTime _now = new(2026, 10, 10, 12, 0, 0, DateTimeKind.Utc);
    private readonly LoginAttemptTracker _sut;

    public LoginAttemptTrackerTests()
    {
        _sut = new LoginAttemptTracker(() => _now);
    }

    private void Fail(string key, int times)
    {
        for (var i = 0; i < times; i++)
        {
            _sut.RegisterFailure(key);
        }
    }

    [Fact]
    public void FourWrongPasswords_DoNotLock()
    {
        Fail("a@example.com", 4);
        Assert.False(_sut.IsLocked("a@example.com"));
    }

    [Fact]
    public void TheFifthWrongPassword_LocksForOneMinute_ThenUnlocks()
    {
        Fail("a@example.com", 5);
        Assert.True(_sut.IsLocked("a@example.com"));

        _now = _now.AddSeconds(59);
        Assert.True(_sut.IsLocked("a@example.com"));

        _now = _now.AddSeconds(2);
        Assert.False(_sut.IsLocked("a@example.com"));
    }

    [Fact]
    public void PauseGrows_WithEachFurtherFailure()
    {
        Fail("a@example.com", 5);
        _now = _now.AddMinutes(1).AddSeconds(1);

        _sut.RegisterFailure("a@example.com"); // 6th: two minutes
        _now = _now.AddMinutes(1).AddSeconds(30);
        Assert.True(_sut.IsLocked("a@example.com"));
        _now = _now.AddMinutes(1);
        Assert.False(_sut.IsLocked("a@example.com"));
    }

    [Fact]
    public void FailuresDuringAPause_DoNotExtendIt()
    {
        Fail("a@example.com", 5);
        Fail("a@example.com", 20);

        _now = _now.AddMinutes(1).AddSeconds(1);
        Assert.False(_sut.IsLocked("a@example.com"));
    }

    [Fact]
    public void ASuccessfulSignIn_ClearsTheCount()
    {
        Fail("a@example.com", 4);
        _sut.Reset("a@example.com");
        Fail("a@example.com", 4);

        Assert.False(_sut.IsLocked("a@example.com"));
    }

    [Fact]
    public void OldFailures_AreForgotten()
    {
        Fail("a@example.com", 4);
        _now = _now.AddHours(2);
        _sut.RegisterFailure("a@example.com");

        Assert.False(_sut.IsLocked("a@example.com"));
    }

    [Fact]
    public void AccountsAreIndependent_AndTheKeyIgnoresCase()
    {
        Fail("A@Example.com", 5);

        Assert.True(_sut.IsLocked("a@example.com"));
        Assert.False(_sut.IsLocked("b@example.com"));
    }
}
