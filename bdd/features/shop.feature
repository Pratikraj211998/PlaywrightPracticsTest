Feature: Shop login and cart

  Background:
    Given the shop page is open

  @smoke
  Scenario: A valid user logs in
    When I sign in as "asha@example.com" with password "secret"
    Then I see the message "Welcome, asha@example.com"

  Scenario: A wrong password is rejected
    When I sign in as "asha@example.com" with password "wrong"
    Then I see the message "Invalid credentials"

  Scenario Outline: Adding products to the cart
    When I add the product "<product>" to the cart
    Then the cart shows <count> item

    Examples:
      | product    | count |
      | Laptop     | 1     |
      | Phone      | 1     |
      | Headphones | 1     |
