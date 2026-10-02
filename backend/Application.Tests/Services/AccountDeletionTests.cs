using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Application.Services;
using Application.Tests.Fakes;
using Domain.Entities;
using Domain.Interfaces;
using Domain.ValueObjects;

namespace Application.Tests.Services;

/// <summary>Deleting one's own account: password required, administrators excluded, all sessions gone, personal data
/// stripped, and orders / reviews kept (detached from the person) - the App Store 5.1.1(v) requirement.</summary>
public class AccountDeletionTests
{
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();
    private readonly IUserRepository _users = Substitute.For<IUserRepository>();
    private readonly IOrderRepository _orders = Substitute.For<IOrderRepository>();
    private readonly IReviewRepository _reviews = Substitute.For<IReviewRepository>();
    private readonly FakeRefreshTokenRepository _refreshTokens = new();
    private readonly IPasswordHasher _passwordHasher = Substitute.For<IPasswordHasher>();
    private readonly IJwtTokenGenerator _jwt = Substitute.For<IJwtTokenGenerator>();
    private readonly AuthService _sut;
    private int _tokenCounter;

    private readonly User _alice = new() { Id = 1, Email = new Email("alice@example.com"), Name = "Alice", PasswordHash = "hash-alice", Role = UserRole.Customer };
    private readonly User _bob = new() { Id = 2, Email = new Email("bob@example.com"), Name = "Bob", PasswordHash = "hash-bob", Role = UserRole.Customer };
    private readonly User _admin = new() { Id = 3, Email = new Email("admin@example.com"), Name = "Admin", PasswordHash = "hash-admin", Role = UserRole.Admin };

    public AccountDeletionTests()
    {
        _unitOfWork.Users.Returns(_users);
        _unitOfWork.Orders.Returns(_orders);
        _unitOfWork.Reviews.Returns(_reviews);
        _unitOfWork.RefreshTokens.Returns(_refreshTokens);
        _unitOfWork.ExecuteInTransactionAsync(Arg.Any<Func<CancellationToken, Task<bool>>>(), Arg.Any<CancellationToken>())
            .Returns(call => call.Arg<Func<CancellationToken, Task<bool>>>()(CancellationToken.None));
        foreach (var u in new[] { _alice, _bob, _admin })
        {
            _users.GetByIdAsync(u.Id, Arg.Any<CancellationToken>()).Returns(u);
            _users.GetByEmailAsync(u.Email.Value, Arg.Any<CancellationToken>()).Returns(u);
            _refreshTokens.RegisterUser(u);
        }

        _passwordHasher.Verify(Arg.Any<string>(), Arg.Any<string>()).Returns(false);
        _passwordHasher.Verify("alice-pw", "hash-alice").Returns(true);
        _passwordHasher.Verify("bob-pw", "hash-bob").Returns(true);
        _passwordHasher.Verify("admin-pw", "hash-admin").Returns(true);
        _passwordHasher.Hash(Arg.Any<string>()).Returns("dummy-hash");
        _jwt.GenerateAccessToken(Arg.Any<User>(), Arg.Any<Guid>()).Returns("access-token");
        _jwt.GenerateRefreshToken().Returns(_ => $"refresh-token-{++_tokenCounter}");
        _jwt.AccessTokenLifetimeSeconds.Returns(900);
        _sut = new AuthService(_unitOfWork, _passwordHasher, _jwt, NullLogger<AuthService>.Instance);
    }

    private static SessionContext Phone(string device) => new(ClientType.Mobile, device, "Test phone");

    [Fact]
    public async Task AWrongPassword_IsRefused_AndNothingChanges()
    {
        await _sut.LoginAsync(new LoginRequestDto("alice@example.com", "alice-pw"), SessionContext.Web);

        var outcome = await _sut.DeleteAccountAsync(1, "not-her-password");

        Assert.Equal(DeleteAccountOutcome.InvalidPassword, outcome);
        Assert.False(_alice.IsDeleted);
        Assert.Equal("alice@example.com", _alice.Email.Value);
        Assert.Equal("Alice", _alice.Name);
        Assert.Equal("hash-alice", _alice.PasswordHash);
        Assert.Single(_refreshTokens.Tokens, t => t.UserId == 1 && t.RevokedAt is null);
        await _orders.DidNotReceive().AnonymizeContactDataForUserAsync(Arg.Any<int>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task TheOwnerCanDelete_DataIsStripped_AndNoLoginCredentialRemains()
    {
        var outcome = await _sut.DeleteAccountAsync(1, "alice-pw");

        Assert.Equal(DeleteAccountOutcome.Deleted, outcome);
        Assert.True(_alice.IsDeleted);
        Assert.NotNull(_alice.DeletedAt);
        Assert.Equal("deleted-1@deleted.invalid", _alice.Email.Value); // unique per account, undeliverable
        Assert.Equal(User.DeletedDisplayName, _alice.Name);
        Assert.DoesNotContain("Alice", _alice.Name);
        Assert.Equal("!deleted", _alice.PasswordHash);                 // not a bcrypt hash: no password can match
        await _unitOfWork.Received().SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Orders_AreKept_ButLoseTheirContactData_AndReviewsAreNotTouched()
    {
        await _sut.DeleteAccountAsync(1, "alice-pw");

        await _orders.Received(1).AnonymizeContactDataForUserAsync(1, Arg.Any<CancellationToken>());
        await _orders.DidNotReceive().AnonymizeContactDataForUserAsync(2, Arg.Any<CancellationToken>());
        // no order or review is ever removed, and the review repository is not even asked for anything
        _orders.DidNotReceive().Remove(Arg.Any<Order>());
        _reviews.DidNotReceive().Remove(Arg.Any<Review>());
        Assert.Empty(_reviews.ReceivedCalls());
    }

    [Fact]
    public async Task EveryTokenOfTheUser_IsRevokedAndRemoved_NobodyElsesAreTouched()
    {
        await _sut.LoginAsync(new LoginRequestDto("alice@example.com", "alice-pw"), SessionContext.Web);
        await _sut.LoginAsync(new LoginRequestDto("alice@example.com", "alice-pw"), Phone("a-phone-device-0001"));
        await _sut.LoginAsync(new LoginRequestDto("bob@example.com", "bob-pw"), Phone("b-phone-device-0002"));

        await _sut.DeleteAccountAsync(1, "alice-pw");

        Assert.DoesNotContain(_refreshTokens.Tokens, t => t.UserId == 1);
        Assert.Single(_refreshTokens.Tokens, t => t.UserId == 2 && t.RevokedAt is null);
    }

    [Fact]
    public async Task AfterDeletion_TheOldRefreshToken_NoLongerWorks()
    {
        var login = await _sut.LoginAsync(new LoginRequestDto("alice@example.com", "alice-pw"), Phone("a-phone-device-0001"));
        var refreshToken = login.Value!.RefreshToken;

        await _sut.DeleteAccountAsync(1, "alice-pw");

        var refreshed = await _sut.RefreshAsync(refreshToken, Phone("a-phone-device-0001"));
        Assert.False(refreshed.IsSuccess);
    }

    [Fact]
    public async Task AfterDeletion_SigningInIsImpossible_WithTheOldOrThePlaceholderEmail()
    {
        await _sut.DeleteAccountAsync(1, "alice-pw");
        // the real address no longer belongs to anyone ...
        _users.GetByEmailAsync("alice@example.com", Arg.Any<CancellationToken>()).Returns((User?)null);
        // ... and the placeholder finds the (deleted) row, which must still be treated as "no such user"
        _users.GetByEmailAsync("deleted-1@deleted.invalid", Arg.Any<CancellationToken>()).Returns(_alice);

        var withOld = await _sut.LoginAsync(new LoginRequestDto("alice@example.com", "alice-pw"), SessionContext.Web);
        var withPlaceholder = await _sut.LoginAsync(new LoginRequestDto("deleted-1@deleted.invalid", "!deleted"), SessionContext.Web);

        Assert.False(withOld.IsSuccess);
        Assert.False(withPlaceholder.IsSuccess);
        Assert.Equal("Invalid email or password.", withPlaceholder.Errors.Single()); // same text as any failed login
    }

    [Fact]
    public async Task SomeoneElsesAccount_CannotBeDeleted_ByGuessingTheirPasswordOrUsingAnotherId()
    {
        // user 1 is signed in; whatever they send, the id comes from their own token (1) - Bob's data is never reached
        var outcome = await _sut.DeleteAccountAsync(1, "bob-pw");

        Assert.Equal(DeleteAccountOutcome.InvalidPassword, outcome);
        Assert.False(_bob.IsDeleted);
        Assert.Equal("Bob", _bob.Name);
        await _users.DidNotReceive().GetByIdAsync(2, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task TheAdministratorAccount_CannotBeDeleted_ThisWay()
    {
        var outcome = await _sut.DeleteAccountAsync(3, "admin-pw");

        Assert.Equal(DeleteAccountOutcome.NotAllowed, outcome);
        Assert.False(_admin.IsDeleted);
        Assert.Equal("admin@example.com", _admin.Email.Value);
        await _orders.DidNotReceive().AnonymizeContactDataForUserAsync(Arg.Any<int>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task WithAnActiveOrder_DeletionIsRefused_AndNothingChanges_NotEvenTheSessions()
    {
        await _sut.LoginAsync(new LoginRequestDto("alice@example.com", "alice-pw"), Phone("a-phone-device-0001"));
        _orders.HasActiveOrdersForUserAsync(1, Arg.Any<CancellationToken>()).Returns(true);

        var outcome = await _sut.DeleteAccountAsync(1, "alice-pw");

        Assert.Equal(DeleteAccountOutcome.ActiveOrders, outcome);
        Assert.False(_alice.IsDeleted);
        Assert.Equal("alice@example.com", _alice.Email.Value);
        Assert.Equal("Alice", _alice.Name);
        Assert.Equal("hash-alice", _alice.PasswordHash);
        Assert.Null(_alice.DeletedAt);
        // sessions are neither revoked nor removed
        Assert.Single(_refreshTokens.Tokens, t => t.UserId == 1 && t.RevokedAt is null);
        await _orders.DidNotReceive().AnonymizeContactDataForUserAsync(Arg.Any<int>(), Arg.Any<CancellationToken>());
        await _unitOfWork.DidNotReceive().ExecuteInTransactionAsync(Arg.Any<Func<CancellationToken, Task<bool>>>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task TheWrongPassword_IsAnsweredFirst_SoOrdersCannotBeProbedWithoutThePassword()
    {
        _orders.HasActiveOrdersForUserAsync(1, Arg.Any<CancellationToken>()).Returns(true);

        var outcome = await _sut.DeleteAccountAsync(1, "guess");

        Assert.Equal(DeleteAccountOutcome.InvalidPassword, outcome); // 400, same as for a user without orders
        await _orders.DidNotReceive().HasActiveOrdersForUserAsync(Arg.Any<int>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task TheAdministrator_IsStillRefusedAsNotAllowed_EvenWithActiveOrders()
    {
        _orders.HasActiveOrdersForUserAsync(3, Arg.Any<CancellationToken>()).Returns(true);

        Assert.Equal(DeleteAccountOutcome.NotAllowed, await _sut.DeleteAccountAsync(3, "admin-pw"));
        Assert.False(_admin.IsDeleted);
    }

    [Fact]
    public async Task OnceTheOrderIsDeliveredOrCancelled_TheSameRequestSucceeds()
    {
        _orders.HasActiveOrdersForUserAsync(1, Arg.Any<CancellationToken>()).Returns(true);
        Assert.Equal(DeleteAccountOutcome.ActiveOrders, await _sut.DeleteAccountAsync(1, "alice-pw"));
        Assert.False(_alice.IsDeleted);

        _orders.HasActiveOrdersForUserAsync(1, Arg.Any<CancellationToken>()).Returns(false); // the order reached a final status

        Assert.Equal(DeleteAccountOutcome.Deleted, await _sut.DeleteAccountAsync(1, "alice-pw"));
        Assert.True(_alice.IsDeleted);
        await _orders.Received(1).AnonymizeContactDataForUserAsync(1, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task AnUnknownOrAlreadyDeletedAccount_IsNotFound()
    {
        Assert.Equal(DeleteAccountOutcome.NotFound, await _sut.DeleteAccountAsync(99, "x"));

        await _sut.DeleteAccountAsync(1, "alice-pw");
        Assert.Equal(DeleteAccountOutcome.NotFound, await _sut.DeleteAccountAsync(1, "alice-pw"));
    }

    [Fact]
    public void Anonymize_LeavesNoPersonalDataBehind_AndGivesEachAccountItsOwnPlaceholder()
    {
        var a = new User { Id = 10, Email = new Email("someone@example.com"), Name = "Real Name", PasswordHash = "x" };
        var b = new User { Id = 11, Email = new Email("other@example.com"), Name = "Other", PasswordHash = "y" };
        a.Anonymize(DateTime.UtcNow);
        b.Anonymize(DateTime.UtcNow);

        Assert.NotEqual(a.Email.Value, b.Email.Value); // the unique index on Email stays satisfied
        Assert.DoesNotContain("someone", a.Email.Value);
        Assert.DoesNotContain("Real", a.Name);
    }
}
