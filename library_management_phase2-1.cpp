#include <iostream>
#include <string>
#include <vector>
#include <queue>
#include <limits>
using namespace std;

// Library Management System - Phase 2 Backend
// C++ only: no frontend or SQL connection in this phase.

struct Book {
    int id;
    string title;
    string author;
    string category;
    int totalQuantity;
    int availableQuantity;
};

struct Student {
    int id;
    string name;
    string course;
};

struct IssueRecord {
    int issueId;
    int bookId;
    int studentId;
    string issueDate;
    string dueDate;
    bool returned;
};

struct Reservation {
    int bookId;
    int studentId;
};

// Linked List: stores the book records.
class BookLinkedList {
private:
    struct Node {
        Book data;
        Node* next;
        explicit Node(const Book& book) : data(book), next(nullptr) {}
    };

    Node* head;

public:
    BookLinkedList() : head(nullptr) {}

    ~BookLinkedList() {
        clear();
    }

    BookLinkedList(const BookLinkedList&) = delete;
    BookLinkedList& operator=(const BookLinkedList&) = delete;

    bool addBook(const Book& book) {
        if (findBook(book.id) != nullptr) return false;

        Node* newNode = new Node(book);
        if (head == nullptr) {
            head = newNode;
        } else {
            Node* current = head;
            while (current->next != nullptr) current = current->next;
            current->next = newNode;
        }
        return true;
    }

    Book* findBook(int id) {
        Node* current = head;
        while (current != nullptr) {
            if (current->data.id == id) return &current->data;
            current = current->next;
        }
        return nullptr;
    }

    bool deleteBook(int id) {
        Node* current = head;
        Node* previous = nullptr;

        while (current != nullptr) {
            if (current->data.id == id) {
                if (previous == nullptr) head = current->next;
                else previous->next = current->next;

                delete current;
                return true;
            }
            previous = current;
            current = current->next;
        }
        return false;
    }

    void displayBooks() const {
        if (head == nullptr) {
            cout << "\nNo books found.\n";
            return;
        }

        cout << "\n---------------- BOOK INVENTORY ----------------\n";
        cout << "ID\tTitle\t\tAuthor\t\tAvailable/Total\n";
        cout << "------------------------------------------------\n";

        Node* current = head;
        while (current != nullptr) {
            const Book& b = current->data;
            cout << b.id << "\t" << b.title << "\t\t"
                 << b.author << "\t\t" << b.availableQuantity
                 << "/" << b.totalQuantity << "\n";
            current = current->next;
        }
    }

    template <typename Function>
    void forEach(Function function) {
        Node* current = head;
        while (current != nullptr) {
            function(&current->data);
            current = current->next;
        }
    }

    void clear() {
        Node* current = head;
        while (current != nullptr) {
            Node* nextNode = current->next;
            delete current;
            current = nextNode;
        }
        head = nullptr;
    }
};

// Binary Search Tree: indexes books by Book ID.
// Each tree node points to the book object stored in the linked list.
class BookBST {
private:
    struct TreeNode {
        Book* book;
        TreeNode* left;
        TreeNode* right;

        explicit TreeNode(Book* value)
            : book(value), left(nullptr), right(nullptr) {}
    };

    TreeNode* root;

    TreeNode* insertNode(TreeNode* node, Book* book) {
        if (node == nullptr) return new TreeNode(book);

        if (book->id < node->book->id)
            node->left = insertNode(node->left, book);
        else if (book->id > node->book->id)
            node->right = insertNode(node->right, book);

        return node;
    }

    Book* searchNode(TreeNode* node, int id) const {
        if (node == nullptr) return nullptr;
        if (node->book->id == id) return node->book;
        if (id < node->book->id) return searchNode(node->left, id);
        return searchNode(node->right, id);
    }

    void clearNode(TreeNode* node) {
        if (node == nullptr) return;
        clearNode(node->left);
        clearNode(node->right);
        delete node;
    }

public:
    BookBST() : root(nullptr) {}

    ~BookBST() {
        clearNode(root);
    }

    void insert(Book* book) {
        root = insertNode(root, book);
    }

    Book* search(int id) const {
        return searchNode(root, id);
    }

    void clear() {
        clearNode(root);
        root = nullptr;
    }

    // Rebuild after deletion so no tree node points to a deleted book.
    void rebuild(BookLinkedList& books) {
        clear();
        books.forEach([this](Book* book) { insert(book); });
    }
};

class LibraryManagementSystem {
private:
    BookLinkedList books;
    BookBST bookIndex;
    vector<Student> students;
    vector<IssueRecord> issueRecords;
    queue<Reservation> reservations;
    int nextIssueId = 1;

    int readInt(const string& prompt) {
        int value;
        while (true) {
            cout << prompt;
            if (cin >> value) {
                cin.ignore(numeric_limits<streamsize>::max(), '\n');
                return value;
            }
            cout << "Please enter a valid number.\n";
            cin.clear();
            cin.ignore(numeric_limits<streamsize>::max(), '\n');
        }
    }

    string readText(const string& prompt) {
        string value;
        cout << prompt;
        getline(cin, value);
        return value;
    }

    Student* findStudent(int id) {
        for (auto& student : students) {
            if (student.id == id) return &student;
        }
        return nullptr;
    }

    bool hasActiveIssue(int studentId, int bookId) {
        for (const auto& record : issueRecords) {
            if (record.studentId == studentId &&
                record.bookId == bookId && !record.returned) {
                return true;
            }
        }
        return false;
    }

    bool hasActiveIssueForBook(int bookId) {
        for (const auto& record : issueRecords) {
            if (record.bookId == bookId && !record.returned) return true;
        }
        return false;
    }

    bool hasReservation(int studentId, int bookId) {
        queue<Reservation> copy = reservations;
        while (!copy.empty()) {
            Reservation r = copy.front();
            copy.pop();
            if (r.studentId == studentId && r.bookId == bookId) return true;
        }
        return false;
    }

    void addBook() {
        cout << "\n--- Add Book ---\n";
        Book book;
        book.id = readInt("Book ID: ");

        if (bookIndex.search(book.id) != nullptr) {
            cout << "A book with this ID already exists.\n";
            return;
        }

        book.title = readText("Title: ");
        book.author = readText("Author: ");
        book.category = readText("Category: ");
        book.totalQuantity = readInt("Total quantity: ");

        if (book.totalQuantity <= 0) {
            cout << "Quantity must be greater than zero.\n";
            return;
        }

        book.availableQuantity = book.totalQuantity;
        if (books.addBook(book)) {
            Book* storedBook = books.findBook(book.id);
            bookIndex.insert(storedBook);
            cout << "Book added successfully.\n";
        } else {
            cout << "Could not add book.\n";
        }
    }

    void searchBook() {
        cout << "\n--- Search Book (BST) ---\n";
        int id = readInt("Enter Book ID: ");
        Book* book = bookIndex.search(id);

        if (book == nullptr) {
            cout << "Book not found.\n";
            return;
        }

        cout << "\nBook ID: " << book->id
             << "\nTitle: " << book->title
             << "\nAuthor: " << book->author
             << "\nCategory: " << book->category
             << "\nAvailable: " << book->availableQuantity
             << " out of " << book->totalQuantity << "\n";
    }

    void deleteBook() {
        cout << "\n--- Delete Book ---\n";
        int id = readInt("Enter Book ID to delete: ");
        Book* book = bookIndex.search(id);

        if (book == nullptr) {
            cout << "Book not found.\n";
            return;
        }

        if (hasActiveIssueForBook(id)) {
            cout << "Cannot delete: this book has an active issue record.\n";
            return;
        }

        if (book->availableQuantity != book->totalQuantity) {
            cout << "Cannot delete: book quantity records are inconsistent.\n";
            return;
        }

        if (books.deleteBook(id)) {
            bookIndex.rebuild(books);
            cout << "Book deleted successfully.\n";
        }
    }

    void addStudent() {
        cout << "\n--- Register Student ---\n";
        Student student;
        student.id = readInt("Student ID: ");

        if (findStudent(student.id) != nullptr) {
            cout << "A student with this ID already exists.\n";
            return;
        }

        student.name = readText("Student name: ");
        student.course = readText("Course / Class: ");
        students.push_back(student);
        cout << "Student registered successfully.\n";
    }

    void displayStudents() {
        cout << "\n--- Student Records ---\n";
        if (students.empty()) {
            cout << "No students registered.\n";
            return;
        }

        cout << "ID\tName\t\tCourse\n";
        cout << "-------------------------------------\n";
        for (const auto& student : students) {
            cout << student.id << "\t" << student.name
                 << "\t\t" << student.course << "\n";
        }
    }

    void issueBook() {
        cout << "\n--- Issue Book ---\n";
        int studentId = readInt("Student ID: ");
        int bookId = readInt("Book ID: ");

        if (findStudent(studentId) == nullptr) {
            cout << "Student not found. Register the student first.\n";
            return;
        }

        Book* book = bookIndex.search(bookId);
        if (book == nullptr) {
            cout << "Book not found.\n";
            return;
        }

        if (hasActiveIssue(studentId, bookId)) {
            cout << "This student already has this book issued.\n";
            return;
        }

        if (book->availableQuantity <= 0) {
            cout << "No copies available. You can place a reservation.\n";
            return;
        }

        string issueDate = readText("Issue date (YYYY-MM-DD): ");
        string dueDate = readText("Due date (YYYY-MM-DD): ");

        --book->availableQuantity;
        issueRecords.push_back({
            nextIssueId++, bookId, studentId, issueDate, dueDate, false
        });

        cout << "Book issued successfully.\n";
    }

    void returnBook() {
        cout << "\n--- Return Book ---\n";
        int studentId = readInt("Student ID: ");
        int bookId = readInt("Book ID: ");

        for (auto& record : issueRecords) {
            if (record.studentId == studentId &&
                record.bookId == bookId && !record.returned) {
                Book* book = bookIndex.search(bookId);
                if (book == nullptr) {
                    cout << "Book record is missing; return could not be processed.\n";
                    return;
                }

                record.returned = true;
                ++book->availableQuantity;
                cout << "Book returned successfully.\n";
                cout << "Tip: select 'Process Reservations' to handle waiting requests.\n";
                return;
            }
        }

        cout << "No active issue record found for that student and book.\n";
    }

    void reserveBook() {
        cout << "\n--- Reserve Book ---\n";
        int studentId = readInt("Student ID: ");
        int bookId = readInt("Book ID: ");

        if (findStudent(studentId) == nullptr) {
            cout << "Student not found. Register the student first.\n";
            return;
        }
        Book* book = bookIndex.search(bookId);
        if (book == nullptr) {
            cout << "Book not found.\n";
            return;
        }
        if (book->availableQuantity > 0) {
            cout << "A copy is currently available. You can issue it directly.\n";
            return;
        }
        if (hasReservation(studentId, bookId)) {
            cout << "This student already has a reservation for this book.\n";
            return;
        }
        if (hasActiveIssue(studentId, bookId)) {
            cout << "This student already has this book issued.\n";
            return;
        }

        reservations.push({bookId, studentId});
        cout << "Reservation added to the FIFO queue.\n";
    }

    void processReservations() {
        cout << "\n--- Process Reservation Queue (FIFO) ---\n";
        if (reservations.empty()) {
            cout << "No reservation requests waiting.\n";
            return;
        }

        queue<Reservation> waiting;
        int processed = 0;

        while (!reservations.empty()) {
            Reservation request = reservations.front();
            reservations.pop();

            Book* book = bookIndex.search(request.bookId);
            Student* student = findStudent(request.studentId);

            if (book == nullptr || student == nullptr) {
                cout << "Skipped invalid reservation: Book ID "
                     << request.bookId << ", Student ID "
                     << request.studentId << ".\n";
                continue;
            }

            if (book->availableQuantity > 0) {
                cout << "Book '" << book->title << "' is available for "
                     << student->name << " (Student ID "
                     << student->id << ").\n";
                cout << "Reservation is ready, but the issue date and due date "
                        "must be entered through Issue Book.\n";
                waiting.push(request);
            } else {
                waiting.push(request);
            }
        }

        reservations = waiting;
        if (processed == 0) {
            cout << "Queue checked. Requests remain queued until handled "
                    "through the Issue Book menu.\n";
        }
    }

    void displayIssueRecords() {
        cout << "\n--- Issue Records ---\n";
        if (issueRecords.empty()) {
            cout << "No issue records found.\n";
            return;
        }

        cout << "Issue ID\tBook ID\tStudent ID\tIssue Date\tDue Date\tStatus\n";
        for (const auto& record : issueRecords) {
            cout << record.issueId << "\t\t"
                 << record.bookId << "\t"
                 << record.studentId << "\t\t"
                 << record.issueDate << "\t"
                 << record.dueDate << "\t"
                 << (record.returned ? "Returned" : "Issued") << "\n";
        }
    }

    void showMenu() {
        cout << "\n========== LIBRARY MANAGEMENT SYSTEM ==========\n"
             << "1. Add Book\n"
             << "2. Display All Books (Linked List)\n"
             << "3. Search Book by ID (BST)\n"
             << "4. Delete Book\n"
             << "5. Register Student\n"
             << "6. Display Students\n"
             << "7. Issue Book\n"
             << "8. Return Book\n"
             << "9. Reserve Unavailable Book (Queue)\n"
             << "10. Process Reservation Queue\n"
             << "11. Display Issue Records\n"
             << "0. Exit\n"
             << "===============================================\n";
    }

public:
    void run() {
        int choice;
        do {
            showMenu();
            choice = readInt("Enter your choice: ");

            switch (choice) {
                case 1: addBook(); break;
                case 2: books.displayBooks(); break;
                case 3: searchBook(); break;
                case 4: deleteBook(); break;
                case 5: addStudent(); break;
                case 6: displayStudents(); break;
                case 7: issueBook(); break;
                case 8: returnBook(); break;
                case 9: reserveBook(); break;
                case 10: processReservations(); break;
                case 11: displayIssueRecords(); break;
                case 0: cout << "Exiting Library Management System.\n"; break;
                default: cout << "Invalid choice. Please try again.\n";
            }
        } while (choice != 0);
    }
};

int main() {
    LibraryManagementSystem library;
    library.run();
    return 0;
}
