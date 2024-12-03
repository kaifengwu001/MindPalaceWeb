# Mind Palace Frontend

A React-based frontend for the Mind Palace application, providing an intuitive interface for managing media content in a spatial organization system.

## Technology Stack

- **Framework**: React with TypeScript
- **Authentication**: AWS Amplify/Cognito
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: React Hooks
- **API Communication**: Custom API client

## Key Features

### Authentication Flow
- Email-based signup/signin
- Email verification process
- Session management using AWS Cognito
- Secure token handling

### Palace Management
- Create and list mind palaces
- Rename existing palaces
- Individual palace detail view
- Palace deletion with cascading cleanup

### Media Management
- Drag-and-drop file upload support
- Multi-file upload with progress tracking
- Real-time upload status monitoring
- Media processing status updates
- Thumbnail generation for images and videos

### Sphere Organization
- Grid-based sphere visualization
- Media-to-sphere association
- Sphere creation and deletion
- Empty sphere indicators

## API Integration

### API Client
The frontend includes a custom API client (`api.ts`) that handles:
- Authentication token management
- Request/response formatting
- Upload progress tracking
- Pre-signed URL handling
- Error management

### Backend Communication
- REST API endpoints for all operations
- WebSocket connections for real-time updates
- S3 direct upload for media files
- JWT-based authentication

## Component Structure

### Core Components
- `App.tsx`: Main application container
- `AuthForm.tsx`: Authentication interface
- `PalaceList.tsx`: Palace management view
- `SpheresGrid.tsx`: Media and sphere organization

### State Management
- Authentication state using `useAuth` hook
- Palace selection state
- Upload progress tracking
- Error handling state

## Media Processing Pipeline

1. **Upload Initiation**
   - Request pre-signed URL
   - Create media metadata
   - Initialize progress tracking

2. **Upload Process**
   - Direct S3 upload
   - Progress monitoring
   - Status updates

3. **Processing Status**
   - Poll for media processing status
   - Update UI with processing progress
   - Handle completion/failure states

## Security Features

- JWT token management
- Secure file uploads
- CORS configuration
- User session handling
- Route protection

## Error Handling

- Form validation
- Upload error recovery
- Network error handling
- User feedback system
- Session timeout management

## Integration with Backend

1. **Authentication Flow**
   ```
   Frontend → Cognito → Backend
   ↳ Token management
   ↳ Session handling
   ```

2. **Media Upload Process**
   ```
   Frontend → Backend (Get presigned URL)
   Frontend → S3 (Direct upload)
   S3 → Lambda → MediaConvert
   Backend → Frontend (Status updates)
   ```

3. **Palace/Sphere Management**
   ```
   Frontend ↔ API Gateway ↔ Lambda
   ↳ DynamoDB operations
   ↳ Media associations
   ```

## Development Guidelines

1. **Component Creation**
   - Use TypeScript for type safety
   - Implement error boundaries
   - Follow React best practices

2. **Styling**
   - Use Tailwind utility classes
   - Follow shadcn/ui patterns
   - Maintain responsive design

3. **State Management**
   - Use hooks for local state
   - Implement proper cleanup
   - Handle side effects appropriately

## Testing

1. Component testing focuses on:
   - User interactions
   - State management
   - Error handling
   - Integration testing

## Performance Considerations

- Lazy loading for media content
- Optimized thumbnail loading
- Efficient state updates
- Debounced API calls
- Cached responses