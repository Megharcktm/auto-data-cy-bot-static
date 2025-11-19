import React, { useState } from "react";

function SampleComponent() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Form submitted", formData);
  };

  return (
    <div className="sample-container">
      <h1>Sample Form Component</h1>

      {/* Button with text content */}
      <button onClick={handleSubmit}>Submit Form</button>

      {/* Button with aria-label */}
      <button aria-label="Close dialog">×</button>

      {/* Link without data-cy */}
      <a href="/about">Learn More</a>

      {/* Link with text */}
      <a href="/contact">Contact Us</a>

      {/* Input with placeholder */}
      <input
        type="text"
        placeholder="Enter your name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
      />

      {/* Input with aria-label */}
      <input
        type="email"
        aria-label="Email address"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
      />

      {/* Input with title */}
      <input
        type="password"
        title="Enter your password"
        value={formData.password}
      />

      {/* Select element */}
      <select>
        <option value="">Choose an option</option>
        <option value="1">2111</option>
        <option value="2">Option 2</option>
      </select>

      {/* Textarea with placeholder */}
      <textarea
        placeholder="Enter your message here"
        value={formData.message}
        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
      />

      {/* Element with role="button" */}
      <div role="button" onClick={handleSubmit}>
        Custom Button
      </div>

      {/* Image button with alt text */}
      <input type="image" src="/submit.png" alt="Submit form" />

      {/* Multiple buttons to test indexing */}
      <div className="button-group">
        <button>First Button</button>
        <button>Second Button</button>
        <button>Third Button</button>
      </div>

      {/* Button that already has data-cy (should be skipped) */}
      <button data-cy="existing-button">Already Has Data-Cy</button>

      {/* Non-interactive element (should be skipped) */}
      <div className="info">This is just a div, not interactive</div>
    </div>
  );
}

export default SampleComponent;
