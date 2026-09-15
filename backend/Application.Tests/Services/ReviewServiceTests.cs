using NSubstitute;
using Xunit;
using Application.DTOs;
using Application.Services;
using Domain.Entities;
using Domain.Interfaces;
using Domain.ValueObjects;

namespace Application.Tests.Services;

public class ReviewServiceTests
{
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();
    private readonly IProductRepository _products = Substitute.For<IProductRepository>();
    private readonly IReviewRepository _reviews = Substitute.For<IReviewRepository>();
    private readonly IUserRepository _users = Substitute.For<IUserRepository>();
    private readonly ReviewService _sut;

    public ReviewServiceTests()
    {
        _unitOfWork.Products.Returns(_products);
        _unitOfWork.Reviews.Returns(_reviews);
        _unitOfWork.Users.Returns(_users);
        _sut = new ReviewService(_unitOfWork);
    }

    [Fact]
    public async Task CreateReviewAsync_WhenUserHasNoExistingReview_Succeeds()
    {
        const int productId = 1;
        const int userId = 7;
        _products.GetByIdAsync(productId, Arg.Any<CancellationToken>())
            .Returns(new Product { Id = productId, Name = "Dress", Price = new Money(1000) });
        _reviews.GetByProductAndUserAsync(productId, userId, Arg.Any<CancellationToken>())
            .Returns((Review?)null);
        _reviews.GetAggregateAsync(productId, Arg.Any<CancellationToken>())
            .Returns((5m, 1));

        var result = await _sut.CreateReviewAsync(productId, userId, new CreateReviewRequestDto(5, "Great!"));

        Assert.True(result.IsSuccess);
        await _reviews.Received(1).AddAsync(Arg.Any<Review>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CreateReviewAsync_WhenUserAlreadyReviewedProduct_ReturnsFailure()
    {
        const int productId = 1;
        const int userId = 7;
        _products.GetByIdAsync(productId, Arg.Any<CancellationToken>())
            .Returns(new Product { Id = productId, Name = "Dress", Price = new Money(1000) });
        _reviews.GetByProductAndUserAsync(productId, userId, Arg.Any<CancellationToken>())
            .Returns(new Review { Id = 1, ProductId = productId, UserId = userId, Rating = 4, Comment = "Ok" });

        var result = await _sut.CreateReviewAsync(productId, userId, new CreateReviewRequestDto(5, "Duplicate!"));

        Assert.False(result.IsSuccess);
        await _reviews.DidNotReceive().AddAsync(Arg.Any<Review>(), Arg.Any<CancellationToken>());
    }
}
