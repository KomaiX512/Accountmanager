# JSON Decoder Utility

A comprehensive JSON decoder that transforms raw JSON data into beautifully formatted React content by intelligently interpreting special characters, structure, and formatting cues.

## Features

### 🎯 **Intelligent JSON Parsing**
- Automatically detects and handles different data types (strings, objects, arrays, primitives)
- Removes JSON artifacts (escape characters, brackets, quotes, commas)
- Preserves meaningful formatting while cleaning up noise

### 🎨 **Advanced Text Formatting**
- **Bold text**: `*text*`, `**text**`, `***text***`
- **Italic text**: `_text_`, `__text__`
- **Highlighting**: `[text]`, `{text}`, `(IMPORTANT: text)`
- **Key-value pairs**: Automatically formats `"key: value"` patterns

### 📋 **Smart Content Structure**
- Automatically detects headings, subheadings, and content
- Converts bullet points and list items
- Maintains proper hierarchy and nesting
- Handles complex nested JSON structures

### 🎭 **Customizable Styling**
- Configurable CSS class prefixes
- Level-based indentation
- Responsive design support
- Beautiful animations and transitions

## Usage

### Basic Usage

```typescript
import { decodeJSONToReactElements } from '../utils/jsonDecoder';

const MyComponent = ({ data }) => {
  const decodedSections = decodeJSONToReactElements(data, {
    customClassPrefix: 'my-component',
    enableBoldFormatting: true,
    enableItalicFormatting: true,
    enableHighlighting: true,
    maxNestingLevel: 4
  });

  return (
    <div>
      {decodedSections.map((section, idx) => (
        <div key={idx} className="content-section">
          <h6 className="section-heading">{section.heading}</h6>
          <div className="content-wrapper">
            {section.content}
          </div>
        </div>
      ))}
    </div>
  );
};
```

### Configuration Options

```typescript
interface DecodingOptions {
  preserveLineBreaks?: boolean;      // Default: true
  enableBoldFormatting?: boolean;    // Default: true
  enableItalicFormatting?: boolean;  // Default: true
  enableHighlighting?: boolean;      // Default: true
  maxNestingLevel?: number;          // Default: 5
  customClassPrefix?: string;        // Default: 'decoded'
}
```

### Backward Compatibility

For existing components, you can use the simplified version:

```typescript
import { decodeRawContent } from '../utils/jsonDecoder';

const sections = decodeRawContent(rawText, options);
```

## Integration Examples

### CS Analysis Component

```typescript
const renderAnalysisContent = (analysisData: any) => {
  const decodedSections = decodeJSONToReactElements(analysisData, {
    customClassPrefix: 'analysis',
    enableBoldFormatting: true,
    enableItalicFormatting: true,
    enableHighlighting: true,
    maxNestingLevel: 4
  });

  return decodedSections.map((section, idx) => (
    <div key={idx} className="analysis-subsection">
      <h6 className="analysis-subheading">{section.heading}</h6>
      <div className="analysis-content-wrapper">
        {section.content}
      </div>
    </div>
  ));
};
```

### Our Strategies Component

```typescript
const renderStrategyContent = (strategyData: any) => {
  const decodedSections = decodeJSONToReactElements(strategyData, {
    customClassPrefix: 'strategy',
    enableBoldFormatting: true,
    enableItalicFormatting: true,
    enableHighlighting: true,
    maxNestingLevel: 4
  });

  return decodedSections.map((section, idx) => (
    <div key={idx} className="strategy-subsection">
      <h6 className="strategy-subheading">{section.heading}</h6>
      <div className="strategy-content-wrapper">
        {section.content}
      </div>
    </div>
  ));
};
```

## CSS Integration

### Required CSS Import

```typescript
import '../../utils/jsonDecoder.css';
```

### Custom Styling

The decoder generates CSS classes based on your `customClassPrefix`:

```css
/* Base classes */
.your-prefix-content { /* Content paragraphs */ }
.your-prefix-list-item { /* List items */ }
.your-prefix-highlight { /* Highlighted text */ }
.your-prefix-key { /* Key in key-value pairs */ }
.your-prefix-value { /* Value in key-value pairs */ }

/* Level-based classes */
.your-prefix-level-0 { /* Top level */ }
.your-prefix-level-1 { /* First nesting level */ }
.your-prefix-level-2 { /* Second nesting level */ }
/* ... up to maxNestingLevel */
```

### Integration with Existing Styles

```css
/* Example: Analysis component integration */
.analysis-content-wrapper .analysis-content,
.analysis-content-wrapper .analysis-list-item {
  line-height: 1.6;
  color: #e0e0ff;
  margin: 0.5rem 0;
  font-size: 0.95rem;
}

.analysis-content-wrapper .analysis-content strong,
.analysis-content-wrapper .analysis-list-item strong {
  color: #00ffcc;
  font-weight: 600;
}
```

## Special Character Handling

The decoder intelligently handles various JSON artifacts:

### Cleaned Automatically
- `\"` → `"`
- `\\` → `\`
- `\n` → Line breaks
- `\t` → Tabs
- `{ }` → Removed or converted to spaces
- `[ ]` → Removed or converted to spaces
- Extra commas and colons → Properly formatted

### Formatting Patterns Recognized
- `*bold text*` → **bold text**
- `_italic text_` → *italic text*
- `[highlighted]` → <span class="highlight">highlighted</span>
- `Key: Value` → <span class="key">Key:</span> <span class="value">Value</span>

## Advanced Features

### Heading Detection
The decoder automatically detects headings based on:
- Lines ending with `:`
- Lines starting with numbers and dots (`1. Title`)
- Title case text without much punctuation
- Common heading keywords (Overview, Summary, Analysis, etc.)

### List Processing
Automatically converts various bullet point formats:
- `*` → `•`
- `-` → `•`
- `•` → `•`
- `→` → `•`
- `▪` → `•`

### Nested Structure Handling
- Maintains proper parent-child relationships
- Applies appropriate indentation
- Limits nesting depth to prevent overflow
- Preserves logical content hierarchy

## Utility Functions

### formatCount
```typescript
import { formatCount } from '../utils/jsonDecoder';

formatCount(1500); // "1.5K"
formatCount(1500000); // "1.5M"
```

### cleanText
```typescript
import { cleanText } from '../utils/jsonDecoder';

const cleaned = cleanText(rawJsonString);
```

## Platform Support

The decoder works seamlessly across all platforms:
- Instagram analysis and strategies
- Twitter analysis and strategies
- Any future platform integrations

## Performance Considerations

- Efficient regex processing
- Minimal DOM manipulation
- Cached element creation
- Optimized for large datasets
- Memory-conscious design

## Troubleshooting

### Common Issues

1. **Missing styles**: Ensure you import `jsonDecoder.css`
2. **Incorrect formatting**: Check your `customClassPrefix` matches your CSS
3. **Performance issues**: Consider reducing `maxNestingLevel` for very large datasets
4. **Layout problems**: Verify your container CSS doesn't conflict with decoder classes

### Debug Mode

Enable console logging by modifying the decoder:

```typescript
const decoder = new JSONDecoder({
  ...options,
  debug: true // Add this for debugging
});
```

## Future Enhancements

- [ ] Markdown support
- [ ] Custom formatting rules
- [ ] Export to different formats
- [ ] Advanced syntax highlighting
- [ ] Plugin system for custom processors

---

**Note**: This decoder is designed to be feature-proof and handles edge cases gracefully. It maintains backward compatibility while providing advanced formatting capabilities for modern JSON data structures. 